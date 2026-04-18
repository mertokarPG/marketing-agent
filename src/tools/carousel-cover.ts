import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import puppeteer from "puppeteer";
import {
  renderGradientHtml,
  pickRandomMood,
  pickAccentForMood,
  isMoodDark,
  GRADIENT_MOODS,
  type GradientMood,
} from "../lib/gradient.js";

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1350;
const TMP_DIR = path.resolve("tmp/covers");

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

export type CoverBackground = "cream" | GradientMood | "gradient-random";

export interface CarouselCoverInput {
  templateId: string;
  slots: {
    kicker?: string | null;
    headline: string;
    accentWord?: string | null;
    subtitle?: string | null;
    decorativeChar?: string | null;
    stickerText?: string | null;
  };
  background?: CoverBackground | null;
  accentColor?: string | null;
  pageNumber?: number | null;
  totalPages?: number | null;
  branding: BrandingConfig;
  brandDir: string;
  instagramHandle: string;
}

interface Theme {
  textColor: string;
  subtitleColor: string;
  gridColor: string;
  logoFilter: string;
  pageIndicatorBg: string;
  bgLayer: string;
  showGrid: boolean;
}

interface ThemeResult {
  theme: Theme;
  mood: GradientMood | null;
}

async function buildTheme(bg: CoverBackground | null | undefined): Promise<ThemeResult> {
  const cream: Theme = {
    textColor: "#111111",
    subtitleColor: "#444444",
    gridColor: "rgba(17,17,17,0.04)",
    logoFilter: "brightness(0)",
    pageIndicatorBg: "rgba(17,17,17,0.08)",
    bgLayer: "<div style=\"position:absolute;inset:0;background:#f4efe8;\"></div>",
    showGrid: true,
  };
  if (!bg || bg === "cream") return { theme: cream, mood: null };

  const mood: GradientMood =
    bg === "gradient-random" ? pickRandomMood() : (bg as GradientMood);
  const gradientHtml = await renderGradientHtml({ mood });
  const dark = isMoodDark(mood);

  return {
    theme: {
      textColor: dark ? "#ffffff" : "#111111",
      subtitleColor: dark ? "rgba(255,255,255,0.75)" : "#333333",
      gridColor: dark ? "rgba(255,255,255,0.04)" : "rgba(17,17,17,0.04)",
      logoFilter: dark ? "brightness(0) invert(1)" : "brightness(0)",
      pageIndicatorBg: dark ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.6)",
      bgLayer: gradientHtml,
      showGrid: false,
    },
    mood,
  };
}

function ensureTmpDir(): void {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
}

function fileUrl(absPath: string): string {
  return `file://${absPath}`;
}

function dataUrlFromFile(absPath: string, mime: string): string {
  const b64 = fs.readFileSync(absPath).toString("base64");
  return `data:${mime};base64,${b64}`;
}

function imageMime(absPath: string): string {
  const ext = path.extname(absPath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHeadline(headline: string, accentWord: string | null | undefined): string {
  const safeHeadline = escapeHtml(headline);
  if (!accentWord) return safeHeadline;
  const safeAccent = escapeHtml(accentWord);
  // Case-insensitive replace of the accent phrase, first occurrence only
  const regex = new RegExp(escapeHtml(accentWord).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  if (regex.test(safeHeadline)) {
    return safeHeadline.replace(regex, `<span class="accent">${safeAccent}</span>`);
  }
  return `${safeHeadline} <span class="accent">${safeAccent}</span>`;
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

export async function renderCarouselCover(input: CarouselCoverInput): Promise<string> {
  ensureTmpDir();

  const templatePath = path.resolve(input.brandDir, "templates", `${input.templateId}.html`);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${input.templateId}.html in ${input.brandDir}/templates/`);
  }
  let html = fs.readFileSync(templatePath, "utf-8");

  // Font paths — default to carephoto layout; fall back to absolute URLs from brandDir
  const fontsDir = path.resolve(input.brandDir, "assets/fonts");
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

  // Background theme (cream or mood gradient). Determines which accent pool is safe.
  const { theme, mood } = await buildTheme(input.background);

  // Accent color — when a gradient mood is active, prefer mood-specific accents
  // that are guaranteed to contrast with the background.
  const accent = input.accentColor
    ? input.accentColor
    : mood
      ? pickAccentForMood(mood)
      : pickAccent(
          input.accentColor,
          input.branding.accentPalette,
          input.branding.colors?.accent ?? "#c1272d"
        );
  html = html.replaceAll("__ACCENT_COLOR__", accent);

  html = html.replaceAll("__TEXT_COLOR__", theme.textColor);
  html = html.replaceAll("__SUBTITLE_COLOR__", theme.subtitleColor);
  html = html.replaceAll("__GRID_COLOR__", theme.gridColor);
  html = html.replaceAll("__LOGO_FILTER__", theme.logoFilter);
  html = html.replaceAll("__PAGE_INDICATOR_BG__", theme.pageIndicatorBg);
  html = html.replaceAll("__BG_LAYER__", theme.bgLayer);
  html = html.replaceAll(
    "__GRID__",
    theme.showGrid ? '<div class="grid-overlay"></div>' : ""
  );

  // Headline + accent word
  html = html.replaceAll("__HEADLINE__", renderHeadline(input.slots.headline, input.slots.accentWord));

  // Kicker
  html = html.replaceAll(
    "__KICKER__",
    input.slots.kicker ? `<div class="kicker">${escapeHtml(input.slots.kicker)}</div>` : ""
  );

  // Subtitle
  html = html.replaceAll(
    "__SUBTITLE__",
    input.slots.subtitle ? `<p class="subtitle">${escapeHtml(input.slots.subtitle)}</p>` : ""
  );

  // Decorative character
  html = html.replaceAll(
    "__DECORATIVE_CHAR__",
    input.slots.decorativeChar
      ? `<div class="decorative-char">${escapeHtml(input.slots.decorativeChar)}</div>`
      : ""
  );

  // Sticker
  html = html.replaceAll(
    "__STICKER__",
    input.slots.stickerText ? `<div class="sticker">${escapeHtml(input.slots.stickerText)}</div>` : ""
  );

  // Page indicator
  html = html.replaceAll(
    "__PAGE_INDICATOR__",
    input.pageNumber && input.totalPages
      ? `<div class="page-indicator">${input.pageNumber} / ${input.totalPages}</div>`
      : ""
  );

  // Handle
  html = html.replaceAll("__HANDLE__", escapeHtml(input.instagramHandle));

  // IG icon (embed as base64 — file:// URLs don't load from setContent origin)
  const igIconPath = input.branding.instagramIconPath
    ? path.resolve(input.brandDir, input.branding.instagramIconPath)
    : null;
  html = html.replaceAll(
    "__IG_ICON__",
    igIconPath && fs.existsSync(igIconPath)
      ? `<img src="${dataUrlFromFile(igIconPath, imageMime(igIconPath))}" alt="ig" />`
      : ""
  );

  // Logo (embed as base64)
  const logoPath = path.resolve(input.brandDir, input.branding.logoPath);
  html = html.replaceAll(
    "__LOGO__",
    fs.existsSync(logoPath)
      ? `<img src="${dataUrlFromFile(logoPath, imageMime(logoPath))}" alt="logo" class="logo" />`
      : ""
  );

  // Render with Puppeteer. protocolTimeout capped so we fail loud instead of hanging 3 min.
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
    await page.screenshot({
      path: outputPath as `${string}.png`,
      type: "png",
      omitBackground: false,
      timeout: 20000,
    });
    const elapsed = Date.now() - t0;
    console.log(`[carousel_cover] rendered ${input.templateId} in ${elapsed}ms → ${outputPath}`);
    return outputPath;
  } catch (err) {
    const elapsed = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[carousel_cover] FAILED after ${elapsed}ms: ${msg}`);
    throw new Error(`carousel_cover render failed (${elapsed}ms): ${msg}`);
  } finally {
    await browser.close();
  }
}
