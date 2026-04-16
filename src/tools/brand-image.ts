import sharp, { OverlayOptions } from "sharp";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1350;
const PADDING = 40;
const LOGO_SIZE = 72;

interface BrandingConfig {
  enabled: boolean;
  logoPath: string;
  fontPath?: string;
  fontFamily?: string;
  instagramIconPath?: string;
  showLogo: boolean;
  showHandle: boolean;
  showPageIndicator: boolean;
  showSwipeArrow: boolean;
}

interface BrandImageInput {
  imageSource: string | null; // local path or URL; null → text card
  textOverlay: string | null;
  textPosition: "top" | "center" | "bottom";
  isThumbnail: boolean;
  pageNumber: number | null;
  totalPages: number | null;
  backgroundColor: string | null;
  branding: BrandingConfig;
  brandDir: string;
  instagramHandle: string;
}

const TMP_DIR = path.resolve("tmp/branded");

function ensureTmpDir(): void {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

async function fetchImage(source: string): Promise<Buffer> {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  return fs.readFileSync(source);
}

function buildFontFaceSvg(fontBase64: string | null, fontFamily: string): string {
  if (!fontBase64) return "";
  return `<style>
    @font-face {
      font-family: '${fontFamily}';
      src: url('data:font/ttf;base64,${fontBase64}');
    }
  </style>`;
}

function buildGradientScrimSvg(position: "top" | "center" | "bottom"): Buffer {
  let gradient: string;
  if (position === "top") {
    gradient = `<linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="black" stop-opacity="0.7"/>
        <stop offset="60%" stop-color="black" stop-opacity="0"/>
      </linearGradient>`;
  } else if (position === "bottom") {
    gradient = `<linearGradient id="scrim" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stop-color="black" stop-opacity="0.7"/>
        <stop offset="60%" stop-color="black" stop-opacity="0"/>
      </linearGradient>`;
  } else {
    gradient = `<radialGradient id="scrim" cx="50%" cy="50%" r="70%">
        <stop offset="0%" stop-color="black" stop-opacity="0"/>
        <stop offset="100%" stop-color="black" stop-opacity="0.5"/>
      </radialGradient>`;
  }

  const svg = `<svg width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>${gradient}</defs>
    <rect x="0" y="0" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" fill="url(#scrim)"/>
  </svg>`;
  return Buffer.from(svg);
}

function buildTextOverlaySvg(
  text: string,
  position: "top" | "center" | "bottom",
  isThumbnail: boolean,
  fontFamily: string,
  fontBase64: string | null
): Buffer {
  const fontSize = isThumbnail ? 64 : 42;
  const fontWeight = isThumbnail ? 800 : 600;
  const lineHeight = fontSize * 1.3;

  const lines = text.split("\n");
  const totalTextHeight = lines.length * lineHeight;

  let yStart: number;
  if (position === "top") {
    yStart = PADDING + LOGO_SIZE + 40;
  } else if (position === "bottom") {
    yStart = CANVAS_HEIGHT - totalTextHeight - 120;
  } else {
    yStart = (CANVAS_HEIGHT - totalTextHeight) / 2;
  }

  const textLines = lines
    .map(
      (line, i) =>
        `<text x="${PADDING + 10}" y="${yStart + i * lineHeight}"
          font-family="'${fontFamily}', Arial, Helvetica, sans-serif" font-size="${fontSize}"
          font-weight="${fontWeight}" fill="white"
          filter="url(#shadow)">${escapeXml(line)}</text>`
    )
    .join("\n");

  const svg = `<svg width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      ${buildFontFaceSvg(fontBase64, fontFamily)}
      <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="3" stdDeviation="${isThumbnail ? 8 : 5}" flood-color="rgba(0,0,0,0.7)"/>
      </filter>
    </defs>
    ${textLines}
  </svg>`;

  return Buffer.from(svg);
}

function buildPageIndicatorSvg(page: number, total: number, fontFamily: string, fontBase64: string | null): Buffer {
  const text = `${page}/${total}`;
  const svg = `<svg width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>${buildFontFaceSvg(fontBase64, fontFamily)}</defs>
    <rect x="${CANVAS_WIDTH - PADDING - 80}" y="${PADDING}" width="80" height="36" rx="18" fill="rgba(0,0,0,0.6)"/>
    <text x="${CANVAS_WIDTH - PADDING - 40}" y="${PADDING + 24}"
      font-family="'${fontFamily}', Arial, Helvetica, sans-serif" font-size="16" font-weight="600"
      fill="white" text-anchor="middle">${text}</text>
  </svg>`;
  return Buffer.from(svg);
}

function buildSwipeArrowSvg(): Buffer {
  const cx = CANVAS_WIDTH - 28;
  const cy = CANVAS_HEIGHT / 2;
  const svg = `<svg width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${cx}" cy="${cy}" r="20" fill="rgba(255,255,255,0.2)"/>
    <text x="${cx}" y="${cy + 6}" font-family="Arial" font-size="20" fill="white" text-anchor="middle">›</text>
  </svg>`;
  return Buffer.from(svg);
}

function buildHandleBarSvg(handle: string, fontFamily: string, fontBase64: string | null, igIconBase64: string | null): Buffer {
  const barHeight = 52;
  const barY = CANVAS_HEIGHT - barHeight;
  const iconSize = 24;
  const iconY = barY + 14;

  const igIcon = igIconBase64
    ? `<image x="${PADDING}" y="${iconY}" width="${iconSize}" height="${iconSize}" href="data:image/png;base64,${igIconBase64}"/>`
    : `<rect x="${PADDING}" y="${iconY}" width="${iconSize}" height="${iconSize}" rx="6" fill="none" stroke="white" stroke-width="2"/>
       <text x="${PADDING + 12}" y="${iconY + 18}" font-family="Arial" font-size="11" font-weight="bold" fill="white" text-anchor="middle">IG</text>`;

  const svg = `<svg width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>${buildFontFaceSvg(fontBase64, fontFamily)}</defs>
    <rect x="0" y="${barY}" width="${CANVAS_WIDTH}" height="${barHeight}" fill="rgba(0,0,0,0.5)"/>
    ${igIcon}
    <text x="${PADDING + 36}" y="${barY + 33}" font-family="'${fontFamily}', Arial, Helvetica, sans-serif" font-size="16" font-weight="500" fill="white">@${escapeXml(handle)}</text>
  </svg>`;
  return Buffer.from(svg);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function brandImage(input: BrandImageInput): Promise<string> {
  ensureTmpDir();

  const { branding } = input;

  // Load custom font as base64 for SVG embedding
  const fontFamily = branding.fontFamily ?? "Arial";
  let fontBase64: string | null = null;
  if (branding.fontPath) {
    const fontAbsPath = path.resolve(input.brandDir, branding.fontPath);
    if (fs.existsSync(fontAbsPath)) {
      fontBase64 = fs.readFileSync(fontAbsPath).toString("base64");
    }
  }

  // Load IG icon as base64 for SVG embedding
  let igIconBase64: string | null = null;
  if (branding.instagramIconPath) {
    const iconAbsPath = path.resolve(input.brandDir, branding.instagramIconPath);
    if (fs.existsSync(iconAbsPath)) {
      igIconBase64 = fs.readFileSync(iconAbsPath).toString("base64");
    }
  }

  // 1. Create or load base image
  let base: sharp.Sharp;
  if (input.imageSource) {
    const buf = await fetchImage(input.imageSource);
    base = sharp(buf).resize(CANVAS_WIDTH, CANVAS_HEIGHT, {
      fit: "cover",
      position: "centre",
    });
  } else {
    const bg = input.backgroundColor
      ? hexToRgb(input.backgroundColor)
      : { r: 26, g: 26, b: 46 };
    base = sharp({
      create: {
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        channels: 3,
        background: bg,
      },
    });
  }

  // Convert to png for compositing
  const baseBuffer = await base.png().toBuffer();
  const composites: OverlayOptions[] = [];

  // 2. Gradient scrim behind text for readability
  if (input.textOverlay) {
    composites.push({
      input: buildGradientScrimSvg(input.textPosition),
      top: 0,
      left: 0,
    });
  }

  // 3. Text overlay
  if (input.textOverlay) {
    composites.push({
      input: buildTextOverlaySvg(
        input.textOverlay,
        input.textPosition,
        input.isThumbnail,
        fontFamily,
        fontBase64
      ),
      top: 0,
      left: 0,
    });
  }

  // 4. Logo
  if (branding.showLogo) {
    const logoAbsPath = path.resolve(input.brandDir, branding.logoPath);
    if (fs.existsSync(logoAbsPath)) {
      const logoBuf = await sharp(logoAbsPath)
        .resize(LOGO_SIZE, LOGO_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      composites.push({ input: logoBuf, top: PADDING, left: PADDING });
    }
  }

  // 5. Page indicator
  if (branding.showPageIndicator && input.pageNumber !== null && input.totalPages !== null) {
    composites.push({
      input: buildPageIndicatorSvg(input.pageNumber, input.totalPages, fontFamily, fontBase64),
      top: 0,
      left: 0,
    });
  }

  // 6. Swipe arrow (only for carousel slides, not the last one)
  if (
    branding.showSwipeArrow &&
    input.pageNumber !== null &&
    input.totalPages !== null &&
    input.pageNumber < input.totalPages
  ) {
    composites.push({
      input: buildSwipeArrowSvg(),
      top: 0,
      left: 0,
    });
  }

  // 7. Handle bar
  if (branding.showHandle && input.instagramHandle) {
    composites.push({
      input: buildHandleBarSvg(input.instagramHandle, fontFamily, fontBase64, igIconBase64),
      top: 0,
      left: 0,
    });
  }

  // 8. Composite and save
  const outputPath = path.join(TMP_DIR, `${randomUUID()}.png`);
  await sharp(baseBuffer).composite(composites).png().toFile(outputPath);

  return outputPath;
}

export async function brandCarousel(
  slides: Array<{
    imageSource: string | null;
    textOverlay: string | null;
    textPosition: "top" | "center" | "bottom";
    isThumbnail: boolean;
    backgroundColor: string | null;
  }>,
  branding: BrandingConfig,
  brandDir: string,
  instagramHandle: string
): Promise<string[]> {
  const totalPages = slides.length;
  const paths: string[] = [];

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const outputPath = await brandImage({
      imageSource: slide.imageSource,
      textOverlay: slide.textOverlay,
      textPosition: slide.textPosition,
      isThumbnail: slide.isThumbnail,
      pageNumber: totalPages > 1 ? i + 1 : null,
      totalPages: totalPages > 1 ? totalPages : null,
      backgroundColor: slide.backgroundColor,
      branding,
      brandDir,
      instagramHandle,
    });
    paths.push(outputPath);
  }

  return paths;
}
