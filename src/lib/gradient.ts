// Generates grainy mesh-gradient backgrounds (HTML + inline CSS).
// Palettes are mood-based; blob positions are randomized per render for variety.

import sharp from "sharp";
import puppeteer from "puppeteer";

export type GradientMood =
  | "aurora"
  | "sunset"
  | "ocean"
  | "peach"
  | "noir"
  | "mint"
  | "duotone"
  | "cobalt";

interface Palette {
  bg: string;
  blobs: string[];
  grainOpacity: number;
  blendMode?: "normal" | "screen" | "overlay" | "soft-light";
  accents: string[]; // High-contrast colors safe to use for headlines/accents on this gradient
  isDark: boolean;
}

const PALETTES: Record<GradientMood, Palette> = {
  aurora: {
    bg: "#0a0a1f",
    blobs: ["#06b6d4", "#7c3aed", "#ec4899", "#f97316"],
    grainOpacity: 0.32,
    blendMode: "screen",
    accents: ["#fef08a", "#ffffff", "#86efac", "#fde68a"], // warm yellows + white + mint for contrast on dark chromatic
    isDark: true,
  },
  sunset: {
    bg: "#f5ebd9",
    blobs: ["#ff4d2e", "#ff8a3d", "#ffc857", "#c6478a"],
    grainOpacity: 0.18,
    blendMode: "normal",
    accents: ["#1e3a8a", "#065f46", "#4c1d95", "#0f172a"], // deep cool colors — never pick warm on warm gradient
    isDark: false,
  },
  ocean: {
    bg: "#eaf4f7",
    blobs: ["#0284c7", "#0ea5e9", "#06b6d4", "#6366f1"],
    grainOpacity: 0.2,
    blendMode: "normal",
    accents: ["#991b1b", "#b45309", "#831843", "#0c0a09"], // warm/dark for contrast on cool light
    isDark: false,
  },
  peach: {
    bg: "#fdeedc",
    blobs: ["#ff7849", "#fda4af", "#fcd5a5"],
    grainOpacity: 0.2,
    blendMode: "normal",
    accents: ["#134e4a", "#1e40af", "#7c2d12", "#0a0a0a"], // deep teal/indigo/rust
    isDark: false,
  },
  noir: {
    bg: "#050510",
    blobs: ["#3730a3", "#be185d", "#0891b2"],
    grainOpacity: 0.38,
    blendMode: "screen",
    accents: ["#fef08a", "#ffffff", "#fb923c", "#86efac"], // bright colors for dark bg
    isDark: true,
  },
  mint: {
    bg: "#f0fdf4",
    blobs: ["#059669", "#a7f3d0", "#fde68a"],
    grainOpacity: 0.16,
    blendMode: "normal",
    accents: ["#7c2d12", "#1e3a8a", "#831843", "#0c0a09"], // warm dark
    isDark: false,
  },
  duotone: {
    bg: "#f5ead8",
    blobs: ["#1d4ed8", "#ea580c"],
    grainOpacity: 0.2,
    blendMode: "normal",
    accents: ["#065f46", "#4c1d95", "#0a0a0a"], // avoid orange/blue that match blobs
    isDark: false,
  },
  cobalt: {
    bg: "#050b24",
    blobs: ["#1e40af", "#3b82f6", "#a855f7"],
    grainOpacity: 0.35,
    blendMode: "screen",
    accents: ["#fde68a", "#ffffff", "#fb923c", "#86efac"], // warm yellow/amber for dark blue bg
    isDark: true,
  },
};

/**
 * Pick an accent color that contrasts safely with the given mood's gradient.
 * Use this over brand.accentPalette when a gradient background is in play.
 */
export function pickAccentForMood(mood: GradientMood, seed?: number): string {
  const accents = PALETTES[mood].accents;
  const rand = seed !== undefined ? mulberry32(seed)() : Math.random();
  return accents[Math.floor(rand * accents.length)];
}

export function isMoodDark(mood: GradientMood): boolean {
  return PALETTES[mood].isDark;
}

// Deterministic PRNG so a seed produces the same layout
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// Pre-bake noise PNG tiles. Pixel-perfect random black/white/transparent pixels; Chromium
// renders these faithfully (unlike SVG feTurbulence which gets antialiased away).
function generateGrainTile(size: number, density: number, seed: number): Buffer {
  const buf = Buffer.alloc(size * size * 4);
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) | 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < size * size; i++) {
    const r = next();
    if (r < density / 2) {
      // dark speckle
      buf[i * 4] = 0; buf[i * 4 + 1] = 0; buf[i * 4 + 2] = 0; buf[i * 4 + 3] = 255;
    } else if (r < density) {
      // light speckle
      buf[i * 4] = 255; buf[i * 4 + 1] = 255; buf[i * 4 + 2] = 255; buf[i * 4 + 3] = 255;
    } else {
      buf[i * 4 + 3] = 0; // transparent
    }
  }
  return buf;
}

let GRAIN_DATA_URL: string | null = null;
let GRAIN_READY: Promise<void> | null = null;
async function ensureGrain(): Promise<void> {
  if (GRAIN_DATA_URL) return;
  if (GRAIN_READY) return GRAIN_READY;
  GRAIN_READY = (async () => {
    const raw = generateGrainTile(240, 0.45, 7);
    const png = await sharp(raw, { raw: { width: 240, height: 240, channels: 4 } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    GRAIN_DATA_URL = `url('data:image/png;base64,${png.toString("base64")}')`;
  })();
  return GRAIN_READY;
}

export function pickRandomMood(seed?: number): GradientMood {
  const moods = Object.keys(PALETTES) as GradientMood[];
  const rand = seed !== undefined ? mulberry32(seed)() : Math.random();
  return moods[Math.floor(rand * moods.length)];
}

export interface GradientOptions {
  mood: GradientMood;
  seed?: number;
  blurPx?: number;
}

/**
 * Returns an HTML snippet containing the gradient background.
 * Intended to be placed inside a full-viewport container with position:relative.
 */
export async function renderGradientHtml(opts: GradientOptions): Promise<string> {
  await ensureGrain();
  const palette = PALETTES[opts.mood];
  const blur = opts.blurPx ?? 140;
  const rand = mulberry32(opts.seed ?? Math.floor(Math.random() * 1e9));

  // Organic blob placement: bias each blob to a different "zone" (corners + center)
  // but jitter heavily so no two renders look identical. Sizes vary 60-110%.
  const zones = [
    { x: 0.15, y: 0.25 },
    { x: 0.85, y: 0.2 },
    { x: 0.8, y: 0.8 },
    { x: 0.2, y: 0.8 },
    { x: 0.5, y: 0.5 },
  ];
  // Shuffle zones so blobs don't always go to the same corners
  const shuffled = [...zones].sort(() => rand() - 0.5);

  const blobs = palette.blobs.map((color, i) => {
    const zone = shuffled[i % shuffled.length];
    const x = zone.x + (rand() - 0.5) * 0.3;
    const y = zone.y + (rand() - 0.5) * 0.3;
    const size = 60 + rand() * 55;
    const opacity = 0.85 + rand() * 0.15;
    const blurAmount = blur + (rand() - 0.5) * 40;

    return `<div style="position:absolute;left:${(x * 100).toFixed(1)}%;top:${(y * 100).toFixed(1)}%;transform:translate(-50%,-50%);width:${size.toFixed(1)}%;height:${size.toFixed(1)}%;background:${color};border-radius:50%;opacity:${opacity.toFixed(2)};mix-blend-mode:${palette.blendMode ?? "normal"};filter:blur(${blurAmount.toFixed(0)}px);"></div>`;
  }).join("");

  // Blobs + grain as direct siblings (matches the minimal test structure that works).
  const g = palette.grainOpacity;
  const fineGrain = `<div style="position:absolute;inset:0;background-image:${GRAIN_DATA_URL};background-size:240px 240px;opacity:${g.toFixed(2)};mix-blend-mode:overlay;pointer-events:none;"></div>`;
  const coarseGrain = `<div style="position:absolute;inset:0;background-image:${GRAIN_DATA_URL};background-size:800px 800px;opacity:${(g * 0.55).toFixed(2)};mix-blend-mode:overlay;pointer-events:none;"></div>`;

  return `<div style="position:absolute;inset:0;background:${palette.bg};overflow:hidden;">${blobs}${coarseGrain}${fineGrain}</div>`;
}

export function isGradientMood(v: string): v is GradientMood {
  return v in PALETTES;
}

export const GRADIENT_MOODS = Object.keys(PALETTES) as GradientMood[];

/**
 * Renders a gradient background to a standalone PNG buffer at the given dimensions.
 * Use this when you need the gradient as an image (e.g., to use as the base layer in
 * a separate sharp-based compositor that doesn't want to run its own puppeteer session).
 */
export async function renderGradientPng(
  mood: GradientMood,
  width: number,
  height: number,
  seed?: number
): Promise<Buffer> {
  const gradientHtml = await renderGradientHtml({ mood, seed });
  const html = `<!DOCTYPE html><html><body style="margin:0;width:${width}px;height:${height}px;position:relative;overflow:hidden;">${gradientHtml}</body></html>`;

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    timeout: 20000,
    protocolTimeout: 30000,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 15000 });
    return (await page.screenshot({ type: "png", omitBackground: false, timeout: 20000 })) as Buffer;
  } finally {
    await browser.close();
  }
}
