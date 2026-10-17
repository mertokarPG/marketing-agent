import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import puppeteer from "puppeteer";
import type { ReactJsxManifest } from "../config/load-design-system.js";

const SLIDE_W = 1080;
const SLIDE_H = 1350;
const TMP_DIR = path.resolve("tmp/react-slides");
const SHARED_JSX_PATH = path.resolve("src/react-runtime/shared.jsx");

export type SlideKind = "cover" | "intro" | "numbered" | "stat" | "list" | "image" | "cta";

export interface RenderReactSlideInput {
  designSystem: ReactJsxManifest & { rootDir: string };
  slideKind: SlideKind;
  slide: Record<string, unknown>; // template-kind-specific slot object
  handle: string;
  year: string;
  mode: "light" | "dark";
  markVariant: "quad" | "ring" | "bar";
  pageNumber: number;
  totalPages: number;
  customAccent?: string | null;
}

function ensureTmpDir(): void {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
}

function buildHtml(input: RenderReactSlideInput): string {
  const { designSystem, slideKind, slide, handle, year, mode, markVariant, pageNumber, totalPages, customAccent } = input;

  const sharedJsx = fs.readFileSync(SHARED_JSX_PATH, "utf-8");
  const templatePath = path.join(designSystem.rootDir, "template.jsx");
  const templateJsx = fs.readFileSync(templatePath, "utf-8");

  const basePalette = designSystem.palettes[mode];
  const palette = customAccent ? { ...basePalette, accent: customAccent } : basePalette;

  // Build the slide object the JSX template expects. We merge the caller's slot
  // values with `kind` so the template's switch-on-kind logic dispatches correctly.
  const slideWithKind = { kind: slideKind, ...slide };

  const bootstrapProps = {
    slide: slideWithKind,
    idx: Math.max(0, pageNumber - 1),
    total: Math.max(1, totalPages),
    handle,
    year,
    pal: palette,
    fonts: designSystem.fonts,
    mark: markVariant,
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${designSystem.googleFontsUrl}">
<style>
  html, body { margin: 0; padding: 0; background: ${palette.bg}; overflow: hidden; }
  #root { width: ${SLIDE_W}px; height: ${SLIDE_H}px; }
  *, *::before, *::after { box-sizing: border-box; }
</style>
</head>
<body>
<div id="root"></div>

<script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js" crossorigin></script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js" crossorigin></script>
<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"></script>

<script type="text/babel">
${sharedJsx}
</script>

<script type="text/babel">
${templateJsx}
</script>

<script type="text/babel" data-presets="react">
  const PROPS = ${JSON.stringify(bootstrapProps)};
  const Renderer = window[${JSON.stringify(designSystem.templateName)}];
  if (!Renderer) {
    document.body.setAttribute('data-error', 'Template function ' + ${JSON.stringify(designSystem.templateName)} + ' not found on window');
  } else {
    ReactDOM.createRoot(document.getElementById('root')).render(<Renderer {...PROPS} />);
    // Mark ready on next microtask so Puppeteer can wait for it.
    Promise.resolve().then(() => {
      requestAnimationFrame(() => {
        document.body.setAttribute('data-ready', '1');
      });
    });
  }
</script>
</body>
</html>`;
}

export async function renderReactSlide(input: RenderReactSlideInput): Promise<string> {
  ensureTmpDir();

  const html = buildHtml(input);
  const t0 = Date.now();
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    timeout: 20000,
    protocolTimeout: 40000,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: SLIDE_W, height: SLIDE_H, deviceScaleFactor: 1 });

    // Surface browser errors to the Node-side log so mistranspiled JSX is visible.
    page.on("pageerror", (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[react_slide] pageerror: ${msg}`);
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") console.error(`[react_slide] console.error: ${msg.text()}`);
    });

    await page.setContent(html, { waitUntil: "networkidle0", timeout: 20000 });

    // Wait for the bootstrap to finish mounting (or for a data-error to surface).
    await page.waitForFunction(
      () => document.body.hasAttribute("data-ready") || document.body.hasAttribute("data-error"),
      { timeout: 15000 }
    );

    const err = await page.evaluate(() => document.body.getAttribute("data-error"));
    if (err) throw new Error(err);

    // Let fonts finish loading after the render fires.
    await Promise.race([
      page.evaluate(() => (document as any).fonts.ready),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);

    const outputPath = path.join(TMP_DIR, `${randomUUID()}.png`);
    await page.screenshot({
      path: outputPath as `${string}.png`,
      type: "png",
      omitBackground: false,
      clip: { x: 0, y: 0, width: SLIDE_W, height: SLIDE_H },
    });
    const elapsed = Date.now() - t0;
    console.log(
      `[react_slide] rendered ${input.designSystem.id}/${input.slideKind} in ${elapsed}ms → ${outputPath}`
    );
    return outputPath;
  } catch (err) {
    const elapsed = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[react_slide] FAILED after ${elapsed}ms: ${msg}`);
    throw new Error(`react_slide render failed (${elapsed}ms): ${msg}`);
  } finally {
    await browser.close();
  }
}
