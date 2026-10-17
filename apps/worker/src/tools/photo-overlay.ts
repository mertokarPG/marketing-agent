import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import puppeteer from "puppeteer";

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1350;
const TMP_DIR = path.resolve("tmp/photo-overlay");

interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
}

interface BrandingConfig {
  enabled: boolean;
  logoPath: string;
  instagramIconPath?: string;
  colors?: BrandColors;
  accentPalette?: string[];
}

export type PhotoOverlayTemplate =
  | "photo-caption-bar"
  | "photo-quote-center"
  | "photo-editorial-stack"
  | "photo-chip-corner"
  | "photo-prompt-cover"
  | "photo-prompt-card";

export interface PhotoOverlayInput {
  templateId: PhotoOverlayTemplate;
  photoSource: string; // local path or https URL
  slots: {
    kicker?: string | null;
    headline: string;
    accentWord?: string | null;
    subtitle?: string | null;
    // Prompt-share slots (photo-prompt-cover / photo-prompt-card)
    promptTitle?: string | null;
    promptText?: string | null;
    promptId?: string | null;
    promptModel?: string | null;
    ribbonText?: string | null;
    swipeHint?: string | null;
    swipeAside?: string | null;
  };
  accentColor?: string | null;
  pageNumber?: number | null;
  totalPages?: number | null;
  branding: BrandingConfig;
  brandDir: string;
  designSystemDir: string;
  instagramHandle: string;
}

function ensureTmpDir(): void {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
}

function fileUrl(absPath: string): string {
  return `file://${absPath}`;
}

function imageMime(absPath: string): string {
  const ext = path.extname(absPath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

function dataUrlFromFile(absPath: string, mime: string): string {
  const b64 = fs.readFileSync(absPath).toString("base64");
  return `data:${mime};base64,${b64}`;
}

async function fetchImageBuffer(source: string): Promise<{ buf: Buffer; mime: string }> {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Failed to fetch photo: ${res.status}`);
    const mime = res.headers.get("content-type") ?? "image/jpeg";
    return { buf: Buffer.from(await res.arrayBuffer()), mime };
  }
  return { buf: fs.readFileSync(source), mime: imageMime(source) };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHeadline(headline: string, accentWord: string | null | undefined): string {
  const safe = escapeHtml(headline);
  if (!accentWord) return safe;
  const escapedAccent = escapeHtml(accentWord);
  const regex = new RegExp(escapedAccent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  if (regex.test(safe)) {
    return safe.replace(regex, `<span class="accent">${escapedAccent}</span>`);
  }
  return `${safe} <span class="accent">${escapedAccent}</span>`;
}

function pickAccent(
  explicit: string | null | undefined,
  palette: string[] | undefined,
  fallback: string
): string {
  if (explicit) return explicit;
  if (palette && palette.length > 0) {
    return palette[Math.floor(Math.random() * palette.length)];
  }
  return fallback;
}

export async function renderPhotoOverlay(input: PhotoOverlayInput): Promise<string> {
  ensureTmpDir();

  const templatePath = path.resolve(input.designSystemDir, "templates", `${input.templateId}.html`);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${input.templateId}.html in ${input.designSystemDir}/templates/`);
  }
  let html = fs.readFileSync(templatePath, "utf-8");

  // Fonts (from the design system, not the brand dir)
  const fontsDir = path.resolve(input.designSystemDir, "assets/fonts");
  const fontMap: Record<string, string> = {
    __FONT_SERIF_REGULAR__: fileUrl(path.join(fontsDir, "InstrumentSerif-Regular.ttf")),
    __FONT_SERIF_ITALIC__: fileUrl(path.join(fontsDir, "InstrumentSerif-Italic.ttf")),
    __FONT_SANS_REGULAR__: fileUrl(path.join(fontsDir, "Geist-Regular.ttf")),
    __FONT_SANS_BOLD__: fileUrl(path.join(fontsDir, "Geist-Bold.ttf")),
    __FONT_SANS_BLACK__: fileUrl(path.join(fontsDir, "Geist-Black.ttf")),
  };
  for (const [token, value] of Object.entries(fontMap)) {
    html = html.replaceAll(token, value);
  }

  // Photo background (embed as data URL so file:// origin doesn't matter)
  const { buf, mime } = await fetchImageBuffer(input.photoSource);
  const photoDataUrl = `data:${mime};base64,${buf.toString("base64")}`;
  html = html.replaceAll("__PHOTO_BG__", `<img src="${photoDataUrl}" alt="photo" />`);

  // Accent color
  const accent = pickAccent(
    input.accentColor,
    input.branding.accentPalette,
    input.branding.colors?.accent ?? "#c1272d"
  );
  html = html.replaceAll("__ACCENT_COLOR__", accent);

  // Text slots
  html = html.replaceAll("__HEADLINE__", renderHeadline(input.slots.headline, input.slots.accentWord));

  html = html.replaceAll(
    "__KICKER__",
    input.slots.kicker ? `<div class="kicker">${escapeHtml(input.slots.kicker)}</div>` : ""
  );

  // Chip template uses a separate kicker label slot (plain text, no extra wrapping)
  html = html.replaceAll(
    "__CHIP_KICKER__",
    input.slots.kicker ? escapeHtml(input.slots.kicker) : ""
  );

  html = html.replaceAll(
    "__SUBTITLE__",
    input.slots.subtitle ? `<p class="subtitle">${escapeHtml(input.slots.subtitle)}</p>` : ""
  );

  // Prompt-share slots — only emitted when present so other templates are unaffected.
  if (html.includes("__PROMPT_TITLE__") || html.includes("__PROMPT_TITLE_BLOCK__")) {
    const promptTitle = input.slots.promptTitle ?? "";
    html = html.replaceAll("__PROMPT_TITLE__", escapeHtml(promptTitle));
    html = html.replaceAll(
      "__PROMPT_TITLE_BLOCK__",
      promptTitle
        ? `<h1 class="prompt-title">${escapeHtml(promptTitle)}</h1>`
        : ""
    );
  }

  if (html.includes("__PROMPT_ID_BLOCK__")) {
    const id = input.slots.promptId ?? "";
    html = html.replaceAll(
      "__PROMPT_ID_BLOCK__",
      id ? `<div class="prompt-id">#${escapeHtml(id)}</div>` : ""
    );
  }

  if (html.includes("__MODEL_BADGE__")) {
    const m = input.slots.promptModel ?? "";
    html = html.replaceAll(
      "__MODEL_BADGE__",
      m ? `<span class="model-badge">${escapeHtml(m)}</span>` : ""
    );
  }

  if (html.includes("__RIBBON__")) {
    html = html.replaceAll(
      "__RIBBON__",
      escapeHtml(input.slots.ribbonText ?? "Free prompt inside")
    );
  }

  if (html.includes("__SWIPE_HINT__")) {
    html = html.replaceAll(
      "__SWIPE_HINT__",
      escapeHtml(input.slots.swipeHint ?? "Swipe for the prompt")
    );
  }

  if (html.includes("__SWIPE_ASIDE__")) {
    const aside = input.slots.swipeAside ?? "";
    html = html.replaceAll(
      "__SWIPE_ASIDE__",
      aside ? `<div class="swipe-aside">${escapeHtml(aside)}</div>` : ""
    );
  }

  if (html.includes("__PROMPT_TEXT__")) {
    const text = input.slots.promptText ?? "";
    // Scale font size so the body fills the card without overflowing.
    // Card body area ≈ 880 × 660 px; tuned by hand against real prompts.
    const len = text.length;
    let fontSize = 26;
    if (len > 280) fontSize = 24;
    if (len > 480) fontSize = 22;
    if (len > 720) fontSize = 20;
    if (len > 1000) fontSize = 18;
    if (len > 1400) fontSize = 16;
    if (len > 1900) fontSize = 14;
    html = html.replaceAll("__PROMPT_FONT_SIZE__", `${fontSize}px`);
    html = html.replaceAll("__PROMPT_TEXT__", escapeHtml(text));
  }

  html = html.replaceAll(
    "__PAGE_INDICATOR__",
    input.pageNumber && input.totalPages
      ? `<div class="page-indicator">${input.pageNumber} / ${input.totalPages}</div>`
      : ""
  );

  html = html.replaceAll("__HANDLE__", escapeHtml(input.instagramHandle));

  const igIconPath = input.branding.instagramIconPath
    ? path.resolve(input.brandDir, input.branding.instagramIconPath)
    : null;
  html = html.replaceAll(
    "__IG_ICON__",
    igIconPath && fs.existsSync(igIconPath)
      ? `<img src="${dataUrlFromFile(igIconPath, imageMime(igIconPath))}" alt="ig" />`
      : ""
  );

  const logoPath = path.resolve(input.brandDir, input.branding.logoPath);
  html = html.replaceAll(
    "__LOGO__",
    fs.existsSync(logoPath)
      ? `<img src="${dataUrlFromFile(logoPath, imageMime(logoPath))}" alt="logo" class="logo" />`
      : ""
  );

  // Render
  const t0 = Date.now();
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    timeout: 20000,
    protocolTimeout: 30000,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 15000 });
    await Promise.race([
      page.evaluate(() => (document as any).fonts.ready),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);

    const outputPath = path.join(TMP_DIR, `${randomUUID()}.png`);
    await page.screenshot({ path: outputPath as `${string}.png`, type: "png", omitBackground: false });
    const elapsed = Date.now() - t0;
    console.log(`[photo_overlay] rendered ${input.templateId} in ${elapsed}ms → ${outputPath}`);
    return outputPath;
  } catch (err) {
    const elapsed = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[photo_overlay] FAILED after ${elapsed}ms: ${msg}`);
    throw new Error(`photo_overlay render failed (${elapsed}ms): ${msg}`);
  } finally {
    await browser.close();
  }
}
