import "dotenv/config";
import fs from "fs";
import path from "path";
import { loadBrand } from "../src/config/load-brand.js";
import { loadDesignSystem } from "../src/config/load-design-system.js";
import { renderPhotoOverlay } from "../src/tools/photo-overlay.js";
import { brandImage } from "../src/tools/brand-image.js";
import {
  fillPlaceholdersForVariation,
  detectPlaceholders,
} from "../src/lib/prompt-placeholders.js";
import { generateImage } from "../src/tools/generate-image.js";

const OUT_DIR = path.resolve("tmp/prompt-share");

interface PromptEntry {
  id: string;
  title: string;
  prompt: string;
  image: string;
  category: string;
  model: string;
  description: string;
}

// Pick a prompt to feature. Defaults to the placeholder-bearing "urban-alleyway-portrait"
// so the test demonstrates the format for both placeholder and non-placeholder prompts.
const FEATURED_ID = process.env.PROMPT_ID ?? "urban-alleyway-portrait";

// Number of slides in the carousel. 5 = cover + 3 photo variations + prompt card.
const TOTAL_PAGES = 5;

// When true, call generate_image for each slide. When false, reuse the bank's
// reference image for all 5 (useful when the local carephoto server is offline).
const GENERATE = (process.env.GENERATE ?? "auto") !== "false";

// Map prompt-bank display model names to carephoto API model IDs.
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

// Parse the "Generated image: <url>" line from generate_image's text response.
function extractImageUrl(result: string): string | null {
  const m = result.match(/Generated image:\s*(\S+)/);
  return m ? m[1] : null;
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
  const entry = prompts.find((p) => p.id === FEATURED_ID);
  if (!entry) throw new Error(`Prompt ${FEATURED_ID} not found in bank`);

  // Local file path for the bank image. Same prompt bank lives next to brand.json on disk.
  const promptBankImagesDir = path.dirname(brand.promptBankPath).replace(/\/?$/, "") + "/images";
  const localImage = path.join(
    path.dirname(brand.promptBankPath),
    entry.image.replace(/^\/promptbank\//, "")
  );
  if (!fs.existsSync(localImage)) {
    throw new Error(`Bank image not found locally: ${localImage} (looked under ${promptBankImagesDir})`);
  }

  console.log(`Featuring: ${entry.title} (${entry.id}) — model: ${entry.model}`);
  console.log(`Photo: ${localImage}`);
  console.log(`Prompt length: ${entry.prompt.length} chars`);

  const placeholders = detectPlaceholders(entry.prompt);
  if (placeholders.length > 0) {
    console.log(`Placeholders detected: ${placeholders.map((p) => p.raw).join(", ")}`);
  } else {
    console.log(`No placeholders detected. Same prompt 5×; relying on model stochasticity for variety.`);
  }

  const handle = brand.instagramHandle ?? "careaiphotoeditor";
  const apiModel = mapModel(entry.model);
  const results: Array<{ slide: number; path: string; label: string; sub?: string }> = [];

  // Resolve the source photo for each slide. Index 0 is reserved for the cover,
  // 1-3 for the middle photos, 4 for the prompt card — 5 generations total.
  async function sourceForVariation(variationIndex: number): Promise<{ src: string; fill: string }> {
    const { prompt, fills } = fillPlaceholdersForVariation(entry!.prompt, variationIndex);
    const fillStr = Object.values(fills).join(" · ") || "no placeholders";
    if (!GENERATE) return { src: localImage, fill: `(no-gen) ${fillStr}` };

    const result = await generateImage({
      prompt,
      aspectRatio: "4:5",
      style: null,
      model: apiModel,
    });
    const url = extractImageUrl(result);
    if (!url) {
      console.warn(`  ⚠ generate_image failed for variation ${variationIndex}:`);
      console.warn(`    ${result.split("\n")[0]}`);
      return { src: localImage, fill: `(fallback) ${fillStr}` };
    }
    return { src: url, fill: fillStr };
  }

  // Slide 1 — photo-prompt-cover
  console.log("\n[1/5] photo-prompt-cover ...");
  const { src: src1, fill: fill1 } = await sourceForVariation(0);
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
    designSystemDir: ds.rootDir,
    instagramHandle: handle,
  });
  results.push({ slide: 1, path: copyTo(slide1, "01-cover.png"), label: "Cover", sub: fill1 });

  // Slides 2-4 — pure photo variations via brand_image (no text overlay)
  for (let i = 2; i <= 4; i++) {
    console.log(`[${i}/5] brand_image photo slide ...`);
    const { src, fill } = await sourceForVariation(i - 1);
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
    results.push({ slide: i, path: copyTo(out, `0${i}-variation.png`), label: `Variation ${i - 1}`, sub: fill });
  }

  // Slide 5 — photo-prompt-card
  console.log("\n[5/5] photo-prompt-card ...");
  const { src: src5, fill: fill5 } = await sourceForVariation(4);
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
    designSystemDir: ds.rootDir,
    instagramHandle: handle,
  });
  results.push({ slide: 5, path: copyTo(slide5, "05-prompt-card.png"), label: "Prompt card", sub: fill5 });

  // Gallery HTML
  const galleryHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Prompt Share — ${escapeHtml(entry.title)}</title>
<style>
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #0f0f10; color: #e7e5e4; padding: 48px; }
  h1 { font-size: 32px; margin: 0 0 8px; font-weight: 600; }
  .sub { color: #a8a29e; margin-bottom: 8px; font-size: 16px; }
  .prompt-preview { background: #1a1a1b; border: 1px solid #27272a; border-radius: 12px; padding: 16px 20px; font-size: 13px; color: #d6d3d1; line-height: 1.55; margin-bottom: 32px; max-width: 920px; }
  .prompt-preview b { color: #fca5a5; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 24px; }
  .card { background: #1a1a1b; border: 1px solid #27272a; border-radius: 16px; overflow: hidden; }
  .card img { width: 100%; aspect-ratio: 1080/1350; object-fit: cover; display: block; background: #000; }
  .meta { padding: 14px 18px 18px; }
  .label { font-family: "SF Mono", Menlo, monospace; font-size: 13px; color: #fca5a5; margin-bottom: 4px; }
  .slide-no { font-size: 15px; font-weight: 600; }
  .slots { font-size: 12px; color: #a8a29e; line-height: 1.5; margin-top: 6px; }
</style>
</head>
<body>
<h1>Prompt share — ${escapeHtml(entry.title)}</h1>
<div class="sub">Model: ${escapeHtml(entry.model)} · Category: ${escapeHtml(entry.category)} · ID: ${escapeHtml(entry.id)}</div>
<div class="prompt-preview"><b>Prompt:</b> ${escapeHtml(entry.prompt)}</div>
<div class="grid">
${results
  .map(
    (r) => `  <div class="card">
    <a href="${r.path}" target="_blank"><img src="${r.path}" alt="slide ${r.slide}" /></a>
    <div class="meta">
      <div class="label">Slide ${r.slide} / ${TOTAL_PAGES}</div>
      <div class="slide-no">${escapeHtml(r.label)}</div>
      ${r.sub ? `<div class="slots">${escapeHtml(r.sub)}</div>` : ""}
    </div>
  </div>`
  )
  .join("\n")}
</div>
</body>
</html>`;

  const galleryPath = path.join(OUT_DIR, "gallery.html");
  fs.writeFileSync(galleryPath, galleryHtml);
  console.log(`\n✓ Gallery: ${galleryPath}`);
  console.log(`Open with: open ${galleryPath}`);
}

function copyTo(src: string, name: string): string {
  const dest = path.join(OUT_DIR, name);
  fs.copyFileSync(src, dest);
  return name;
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
