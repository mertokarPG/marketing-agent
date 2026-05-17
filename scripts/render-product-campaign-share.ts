// One-off: render a Prompt Share carousel from a custom prompt with a
// [PRODUCT-PLACEHOLDER] that rotates across 5 mainstream brand products.

import "dotenv/config";
import fs from "fs";
import path from "path";
import { loadBrand } from "../src/config/load-brand.js";
import { loadDesignSystem } from "../src/config/load-design-system.js";
import { renderPhotoOverlay } from "../src/tools/photo-overlay.js";
import { brandImage } from "../src/tools/brand-image.js";
import { generateImage } from "../src/tools/generate-image.js";

const OUT_DIR = path.resolve("tmp/prompt-share-product");
// Cover + 5 product slides + prompt card = 7
const TOTAL_PAGES = 7;

const PROMPT_TEMPLATE =
  "Low-angle fashion campaign photograph of a confident model holding a large [PRODUCT-PLACEHOLDER] very close to the camera, exaggerated perspective with the hand and product dominating the foreground, full-body pose visible in the background, wide stance, dynamic posture, clean pure white studio background, high-key lighting, sharp focus on product, slight depth of field on the model, bold colorful outfit with strong contrast tones, modern beauty advertising aesthetic, ultra-clean composition, commercial studio photography, glossy packaging detail visible, crisp shadows";

// 5 visually distinct mainstream products — each is iconic enough that the
// model "recognizes" it without needing extensive descriptor work.
const PRODUCTS = [
  "classic glass Coca-Cola bottle",
  "Apple iPhone 16 Pro in titanium",
  "Nike Air Jordan 1 sneaker",
  "Chanel No. 5 perfume bottle",
  "Heinz ketchup glass bottle",
];

const PROMPT_TITLE = "Low-Angle Product Campaign";
const PROMPT_ID = "low-angle-product-campaign";
const PROMPT_MODEL_DISPLAY = "Nano Banana 2";

function fillProduct(template: string, product: string): string {
  return template.replaceAll("[PRODUCT-PLACEHOLDER]", product);
}

function extractImageUrl(result: string): string | null {
  const m = result.match(/Generated image:\s*(\S+)/);
  return m ? m[1] : null;
}

interface SlideRow {
  slide: number;
  path: string;
  label: string;
  product: string;
}

async function main() {
  if (fs.existsSync(OUT_DIR)) fs.rmSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const brand = loadBrand("carephoto", path.resolve("brands"));
  const ds = loadDesignSystem(
    brand.designSystem ?? "editorial-paper",
    path.resolve("design-systems")
  );

  const handle = brand.instagramHandle ?? "careaiphotoeditor";
  const results: SlideRow[] = [];
  const generatedUrls: string[] = [];

  console.log(`Rendering Prompt Share for "${PROMPT_TITLE}"`);
  console.log(`Rotation: ${PRODUCTS.join(" · ")}`);

  // 1) Generate 5 images, one per product.
  for (let i = 0; i < PRODUCTS.length; i++) {
    const product = PRODUCTS[i];
    console.log(`\n[gen ${i + 1}/${PRODUCTS.length}] ${product}`);
    const filled = fillProduct(PROMPT_TEMPLATE, product);
    const result = await generateImage({
      prompt: filled,
      aspectRatio: "4:5",
      style: null,
      model: "nano-banana-2",
    });
    const url = extractImageUrl(result);
    if (!url) throw new Error(`generation failed for ${product}: ${result.split("\n")[0]}`);
    generatedUrls.push(url);
  }

  // 2) Slide 1 — photo-prompt-cover (uses gen #1, Coca-Cola)
  console.log("\n[1/5] photo-prompt-cover");
  const slide1 = await renderPhotoOverlay({
    templateId: "photo-prompt-cover",
    photoSource: generatedUrls[0],
    slots: {
      kicker: "Prompt inside",
      headline: "",
      accentWord: null,
      subtitle: null,
      promptTitle: PROMPT_TITLE,
      promptModel: PROMPT_MODEL_DISPLAY,
      ribbonText: "Free prompt",
      swipeHint: "Swipe for the prompt",
      swipeAside: "Swap the product, keep the shot",
    },
    accentColor: brand.branding!.colors!.accent,
    pageNumber: 1,
    totalPages: TOTAL_PAGES,
    branding: brand.branding!,
    brandDir: brand.brandDir,
    designSystemDir: ds.rootDir,
    instagramHandle: handle,
  });
  results.push({
    slide: 1,
    path: copyTo(slide1, "01-cover.png"),
    label: "Cover",
    product: PRODUCTS[0],
  });

  // 3) Slides 2-6 — one clean photo slide PER product. Each carousel slide
  //    shows a different fill (Coca-Cola, iPhone, Jordan, Chanel, Heinz).
  for (let i = 0; i < PRODUCTS.length; i++) {
    const slideNo = i + 2; // slide 2..6
    console.log(`[${slideNo}/${TOTAL_PAGES}] brand_image photo slide → ${PRODUCTS[i]}`);
    const out = await brandImage({
      imageSource: generatedUrls[i],
      textOverlay: null,
      textPosition: "center",
      isThumbnail: false,
      pageNumber: slideNo,
      totalPages: TOTAL_PAGES,
      backgroundColor: null,
      background: null,
      branding: brand.branding!,
      brandDir: brand.brandDir,
      instagramHandle: handle,
    });
    results.push({
      slide: slideNo,
      path: copyTo(
        out,
        `${String(slideNo).padStart(2, "0")}-${PRODUCTS[i].toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`
      ),
      label: `Product ${i + 1}`,
      product: PRODUCTS[i],
    });
  }

  // 4) Slide 7 — photo-prompt-card (uses gen #5, Heinz). Prompt body still
  //    shows the ORIGINAL placeholder so viewers see the fill-in shape.
  console.log(`[${TOTAL_PAGES}/${TOTAL_PAGES}] photo-prompt-card`);
  const slide5 = await renderPhotoOverlay({
    templateId: "photo-prompt-card",
    photoSource: generatedUrls[4],
    slots: {
      kicker: null,
      headline: "",
      accentWord: null,
      subtitle: null,
      promptTitle: PROMPT_TITLE,
      promptModel: PROMPT_MODEL_DISPLAY,
      promptId: PROMPT_ID,
      promptText: PROMPT_TEMPLATE,
    },
    accentColor: brand.branding!.colors!.accent,
    pageNumber: TOTAL_PAGES,
    totalPages: TOTAL_PAGES,
    branding: brand.branding!,
    brandDir: brand.brandDir,
    designSystemDir: ds.rootDir,
    instagramHandle: handle,
  });
  results.push({
    slide: TOTAL_PAGES,
    path: copyTo(slide5, `${String(TOTAL_PAGES).padStart(2, "0")}-prompt-card.png`),
    label: "Prompt card",
    product: PRODUCTS[4],
  });

  // 5) Gallery
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Prompt Share — ${escapeHtml(PROMPT_TITLE)}</title>
<style>
  body { margin: 0; font-family: -apple-system, sans-serif; background: #0b0b0c; color: #e7e5e4; padding: 40px; }
  h1 { font-size: 30px; margin: 0 0 6px; }
  .sub { color: #a8a29e; margin-bottom: 20px; font-size: 14px; }
  .prompt-preview { background: #1a1a1b; border: 1px solid #27272a; border-radius: 10px; padding: 14px 18px; font-size: 13px; color: #d6d3d1; line-height: 1.55; margin-bottom: 28px; max-width: 1000px; }
  .row { display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px; }
  @media (max-width: 1400px) { .row { grid-template-columns: repeat(4, 1fr); } }
  .slide { background: #1b1b1d; border-radius: 12px; overflow: hidden; border: 1px solid #2a2a2d; }
  .slide img { width: 100%; aspect-ratio: 1080/1350; object-fit: cover; display: block; background: #000; }
  .meta { padding: 10px 12px 12px; }
  .label { font-family: "SF Mono", Menlo, monospace; font-size: 11px; color: #fca5a5; }
  .name { font-size: 14px; font-weight: 600; margin: 4px 0; }
  .product { font-size: 12px; color: #a8a29e; }
</style></head><body>
<h1>${escapeHtml(PROMPT_TITLE)}</h1>
<div class="sub">${TOTAL_PAGES} slides (cover + ${PRODUCTS.length} product variations + prompt card) · same prompt, different [PRODUCT-PLACEHOLDER] in each generation.</div>
<div class="prompt-preview"><b>Prompt:</b> ${escapeHtml(PROMPT_TEMPLATE)}</div>
<div class="row">
${results
  .map(
    (r) => `  <div class="slide">
    <a href="${r.path}" target="_blank"><img src="${r.path}"/></a>
    <div class="meta">
      <div class="label">Slide ${r.slide} / 5</div>
      <div class="name">${escapeHtml(r.label)}</div>
      <div class="product">${escapeHtml(r.product)}</div>
    </div>
  </div>`
  )
  .join("\n")}
</div></body></html>`;

  const galleryPath = path.join(OUT_DIR, "gallery.html");
  fs.writeFileSync(galleryPath, html);
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
