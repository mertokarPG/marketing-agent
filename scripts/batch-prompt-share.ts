// Run the Prompt Share generator across a list of prompt-bank IDs and write
// one combined gallery so you can flip through all of them side-by-side.
//
//   npx tsx scripts/batch-prompt-share.ts            # last 20 prompts
//   IDS=id1,id2 npx tsx scripts/batch-prompt-share.ts  # explicit list
//   COUNT=10 npx tsx scripts/batch-prompt-share.ts     # last N prompts
//
// COST WARNING: 5 generations per prompt at ~$0.04–$0.15 per generation.
// 20 prompts × 5 generations × ~$0.10 ≈ $10. Make sure local carephoto is up.

import "dotenv/config";
import fs from "fs";
import path from "path";
import { loadBrand } from "../src/config/load-brand.js";
import { loadDesignSystem } from "../src/config/load-design-system.js";
import { renderPhotoOverlay } from "../src/tools/photo-overlay.js";
import { brandImage } from "../src/tools/brand-image.js";
import {
  detectPlaceholders,
  fillPlaceholdersForVariation,
} from "../src/lib/prompt-placeholders.js";
import { generateImage } from "../src/tools/generate-image.js";

const OUT_DIR = path.resolve("tmp/prompt-share-batch");
const TOTAL_PAGES = 5;
const GENERATE = (process.env.GENERATE ?? "auto") !== "false";

interface PromptEntry {
  id: string;
  title: string;
  prompt: string;
  image: string;
  category: string;
  model: string;
  description: string;
}

function mapModel(
  displayModel: string
):
  | "nano-banana-2"
  | "nano-banana-pro"
  | "flux-lora"
  | "recraft"
  | "seedream-v5-lite"
  | "qwen-image-2-pro"
  | "gpt-image-2" {
  const m = displayModel.toLowerCase();
  if (m.includes("pro") && m.includes("nano")) return "nano-banana-pro";
  if (m.includes("nano")) return "nano-banana-2";
  if (m.includes("flux")) return "flux-lora";
  if (m.includes("seedream") || m.includes("seadream")) return "seedream-v5-lite";
  if (m.includes("qwen")) return "qwen-image-2-pro";
  if (m.includes("gpt")) return "gpt-image-2";
  return "nano-banana-2";
}

function extractImageUrl(result: string): string | null {
  const m = result.match(/Generated image:\s*(\S+)/);
  return m ? m[1] : null;
}

interface SlideRow {
  slide: number;
  path: string;
  label: string;
  sub: string;
}

async function renderOnePromptShare(
  entry: PromptEntry,
  brand: ReturnType<typeof loadBrand>,
  dsRoot: string,
  handle: string,
  bankImageRoot: string,
  promptIdx: number
): Promise<SlideRow[]> {
  const apiModel = mapModel(entry.model);
  const bankImage = path.join(bankImageRoot, entry.image.replace(/^\/?promptbank\//, ""));
  const fallback = fs.existsSync(bankImage) ? bankImage : null;
  const slides: SlideRow[] = [];

  async function source(variationIndex: number): Promise<{ src: string; fill: string }> {
    const { prompt, fills } = fillPlaceholdersForVariation(entry.prompt, variationIndex);
    const fillStr = Object.values(fills).join(" · ") || "no placeholders";
    if (!GENERATE) return { src: fallback ?? bankImage, fill: `(no-gen) ${fillStr}` };

    const result = await generateImage({
      prompt,
      aspectRatio: "4:5",
      style: null,
      model: apiModel,
    });
    const url = extractImageUrl(result);
    if (!url) {
      console.warn(`    ⚠ gen fail v${variationIndex}: ${result.split("\n")[0]}`);
      return { src: fallback ?? bankImage, fill: `(fallback) ${fillStr}` };
    }
    return { src: url, fill: fillStr };
  }

  const placeholders = detectPlaceholders(entry.prompt);

  // Slide 1
  const { src: src1, fill: fill1 } = await source(0);
  const slide1 = await renderPhotoOverlay({
    templateId: "photo-prompt-cover",
    photoSource: src1,
    slots: {
      kicker: "Prompt inside",
      headline: "",
      accentWord: null,
      subtitle: null,
      promptTitle: entry.title,
      promptModel: entry.model,
      ribbonText: "Free prompt",
      swipeHint: "Swipe for the prompt",
      swipeAside: placeholders.length > 0 ? "Fill-in-the-blank prompt" : "Same prompt, 4 looks",
    },
    accentColor: brand.branding!.colors!.accent,
    pageNumber: 1,
    totalPages: TOTAL_PAGES,
    branding: brand.branding!,
    brandDir: brand.brandDir,
    designSystemDir: dsRoot,
    instagramHandle: handle,
  });
  slides.push({
    slide: 1,
    path: copyTo(slide1, `${pad(promptIdx)}-${entry.id}-01.png`),
    label: "Cover",
    sub: fill1,
  });

  for (let i = 2; i <= 4; i++) {
    const { src, fill } = await source(i - 1);
    const out = await brandImage({
      imageSource: src,
      textOverlay: null,
      textPosition: "center",
      isThumbnail: false,
      pageNumber: i,
      totalPages: TOTAL_PAGES,
      backgroundColor: null,
      background: null,
      branding: brand.branding!,
      brandDir: brand.brandDir,
      instagramHandle: handle,
    });
    slides.push({
      slide: i,
      path: copyTo(out, `${pad(promptIdx)}-${entry.id}-0${i}.png`),
      label: `Variation ${i - 1}`,
      sub: fill,
    });
  }

  const { src: src5, fill: fill5 } = await source(4);
  const slide5 = await renderPhotoOverlay({
    templateId: "photo-prompt-card",
    photoSource: src5,
    slots: {
      kicker: null,
      headline: "",
      accentWord: null,
      subtitle: null,
      promptTitle: entry.title,
      promptModel: entry.model,
      promptId: entry.id,
      promptText: entry.prompt,
    },
    accentColor: brand.branding!.colors!.accent,
    pageNumber: 5,
    totalPages: TOTAL_PAGES,
    branding: brand.branding!,
    brandDir: brand.brandDir,
    designSystemDir: dsRoot,
    instagramHandle: handle,
  });
  slides.push({
    slide: 5,
    path: copyTo(slide5, `${pad(promptIdx)}-${entry.id}-05.png`),
    label: "Prompt card",
    sub: fill5,
  });

  return slides;
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const brand = loadBrand("carephoto", path.resolve("brands"));
  if (!brand.promptBankPath) throw new Error("brand has no promptBankPath");
  const ds = loadDesignSystem(
    brand.designSystem ?? "editorial-paper",
    path.resolve("design-systems")
  );
  const prompts = JSON.parse(fs.readFileSync(brand.promptBankPath, "utf-8")) as PromptEntry[];

  let targets: PromptEntry[];
  if (process.env.IDS) {
    const ids = process.env.IDS.split(",").map((s) => s.trim()).filter(Boolean);
    targets = ids.map((id) => {
      const e = prompts.find((p) => p.id === id);
      if (!e) throw new Error(`Prompt id not found: ${id}`);
      return e;
    });
  } else {
    const count = Number(process.env.COUNT ?? 20);
    targets = prompts.slice(prompts.length - count);
  }

  console.log(`Running prompt-share renderer for ${targets.length} prompts. GENERATE=${GENERATE}.`);
  if (GENERATE) {
    console.log(
      `≈ cost estimate: ${targets.length} × 5 gens × ~$0.10 = ~$${(targets.length * 0.5).toFixed(2)}`
    );
  }

  const bankImageRoot = path.dirname(brand.promptBankPath);
  const handle = brand.instagramHandle ?? "careaiphotoeditor";
  const all: Array<{ entry: PromptEntry; slides: SlideRow[] }> = [];

  for (let i = 0; i < targets.length; i++) {
    const entry = targets[i];
    console.log(`\n[${i + 1}/${targets.length}] ${entry.id} — ${entry.title}`);
    try {
      const slides = await renderOnePromptShare(
        entry,
        brand,
        ds.rootDir,
        handle,
        bankImageRoot,
        i + 1
      );
      all.push({ entry, slides });
    } catch (err) {
      console.error(`  ✗ FAILED: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Combined gallery
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>Prompt Share — batch (${all.length} posts)</title>
<style>
  body { margin: 0; font-family: -apple-system, sans-serif; background: #0b0b0c; color: #e7e5e4; padding: 36px; }
  h1 { font-size: 28px; margin: 0 0 8px; }
  .sub { color: #a8a29e; font-size: 14px; margin-bottom: 36px; }
  .post { background: #131315; border: 1px solid #27272a; border-radius: 16px; padding: 24px; margin-bottom: 28px; }
  .post-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 14px; }
  .post-title { font-size: 19px; font-weight: 600; }
  .post-meta { color: #a8a29e; font-size: 13px; font-family: "SF Mono", Menlo, monospace; }
  .row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
  .slide { background: #1b1b1d; border-radius: 10px; overflow: hidden; border: 1px solid #2a2a2d; }
  .slide img { width: 100%; aspect-ratio: 1080/1350; object-fit: cover; display: block; background: #000; }
  .meta { padding: 8px 10px 10px; }
  .label { font-size: 11px; font-family: "SF Mono", Menlo, monospace; color: #fca5a5; }
  .name { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
  .sub-text { font-size: 11px; color: #a8a29e; line-height: 1.35; }
</style>
</head><body>
<h1>Prompt Share — batch</h1>
<div class="sub">${all.length} posts × 5 slides each. Generated: ${GENERATE ? "yes" : "no (using bank image)"}.</div>
${all
  .map(
    ({ entry, slides }) => `<div class="post">
  <div class="post-head">
    <div class="post-title">${escapeHtml(entry.title)}</div>
    <div class="post-meta">${escapeHtml(entry.id)} · ${escapeHtml(entry.model)} · ${escapeHtml(entry.category)}</div>
  </div>
  <div class="row">
${slides
  .map(
    (s) => `    <div class="slide">
      <a href="${s.path}" target="_blank"><img src="${s.path}" alt="${entry.id} slide ${s.slide}"/></a>
      <div class="meta">
        <div class="label">Slide ${s.slide} / 5</div>
        <div class="name">${escapeHtml(s.label)}</div>
        <div class="sub-text">${escapeHtml(s.sub)}</div>
      </div>
    </div>`
  )
  .join("\n")}
  </div>
</div>`
  )
  .join("\n")}
</body></html>`;

  const galleryPath = path.join(OUT_DIR, "gallery.html");
  fs.writeFileSync(galleryPath, html);
  console.log(`\n✓ Combined gallery: ${galleryPath}`);
  console.log(`Open with: open ${galleryPath}`);
}

function copyTo(src: string, name: string): string {
  const dest = path.join(OUT_DIR, name);
  fs.copyFileSync(src, dest);
  return name;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
