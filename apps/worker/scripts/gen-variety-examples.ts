import fs from "fs";
import path from "path";
import { loadBrand } from "../src/config/load-brand.js";
import { loadDesignSystem } from "../src/config/load-design-system.js";
import { renderCarouselCover } from "../src/tools/carousel-cover.js";

const OUT_DIR = path.resolve("tmp/variety-examples");

interface Example {
  template:
    | "cream-numeric-cover"
    | "spec-annotated-cover"
    | "dark-bold-body"
    | "dark-compare-body";
  slots: {
    kicker?: string | null;
    headline: string;
    accentWord?: string | null;
    subtitle?: string | null;
    decorativeChar?: string | null;
    stickerText?: string | null;
  };
  pageNumber?: number | null;
  totalPages?: number | null;
  accentColor?: string | null;
  note: string;
}

const examples: Example[] = [
  // cream-numeric-cover ————————————————————————————————
  {
    template: "cream-numeric-cover",
    slots: {
      kicker: "Something most miss",
      headline: "Signals That Define Great Photos",
      accentWord: null,
      subtitle: "It's not about skills …",
      decorativeChar: "7",
      stickerText: "Find out",
    },
    pageNumber: 1,
    totalPages: 8,
    accentColor: "#ff5f5f",
    note: "Numeric cover — '7 Signals' with sticker",
  },
  {
    template: "cream-numeric-cover",
    slots: {
      kicker: "Quick read",
      headline: "Tiny Fixes For Instantly Better Selfies",
      accentWord: null,
      subtitle: "No new camera required.",
      decorativeChar: "5",
      stickerText: null,
    },
    pageNumber: 1,
    totalPages: 6,
    accentColor: "#ff7a5a",
    note: "Numeric cover — '5 Tiny Fixes' no sticker",
  },

  // spec-annotated-cover ————————————————————————————————
  {
    template: "spec-annotated-cover",
    slots: {
      kicker: null,
      headline: "Profile Photo Mistakes",
      accentWord: null,
      subtitle: "Most daters don't notice",
      decorativeChar: "10",
      stickerText: null,
    },
    pageNumber: 1,
    totalPages: 11,
    accentColor: "#ff5f5f",
    note: "Spec-annotated cover — '10 Mistakes' with squiggle",
  },
  {
    template: "spec-annotated-cover",
    slots: {
      kicker: null,
      headline: "Rules For Any Dating Photo",
      accentWord: null,
      subtitle: "Break them at your own risk",
      decorativeChar: "6",
      stickerText: null,
    },
    pageNumber: 1,
    totalPages: 7,
    accentColor: "#ff5f5f",
    note: "Spec-annotated cover — '6 Rules' variant",
  },

  // dark-bold-body ————————————————————————————————
  {
    template: "dark-bold-body",
    slots: {
      kicker: "Signal 5",
      headline: "They Think In Systems",
      accentWord: null,
      subtitle: "Scale breaks everything that isn't systematic.",
      decorativeChar:
        "Juniors design screens | Seniors design systems | Consistency scales products",
    },
    pageNumber: 5,
    totalPages: 8,
    accentColor: "#f5e14a",
    note: "Bold body — statement headline + bullets + closing line",
  },
  {
    template: "dark-bold-body",
    slots: {
      kicker: "Tip 3",
      headline: "Light Writes The Photo For You",
      accentWord: "Light",
      subtitle: "Before you tap the shutter, look for the window.",
      decorativeChar:
        "Window light is free | Overhead light is flat | Golden hour forgives everything",
    },
    pageNumber: 3,
    totalPages: 7,
    accentColor: "#ff7a5a",
    note: "Bold body — tip with serif accent word",
  },

  // dark-compare-body ————————————————————————————————
  {
    template: "dark-compare-body",
    slots: {
      kicker: "Tip 1",
      headline: "Treating White Space As Wasted Space",
      accentWord: null,
      subtitle:
        "White space is not empty. It creates structure, focus, and clarity.",
      decorativeChar: "Clear structure | Hard to read",
    },
    pageNumber: 1,
    totalPages: 8,
    accentColor: "#f5e14a",
    note: "Compare body — white space good vs bad",
  },
  {
    template: "dark-compare-body",
    slots: {
      kicker: "Tip 4",
      headline: "One Clear Subject Beats Ten",
      accentWord: null,
      subtitle:
        "A single face, a single focus — the eye needs one place to land.",
      decorativeChar: "One focal point | Competing subjects",
    },
    pageNumber: 4,
    totalPages: 8,
    accentColor: "#7fe3b9",
    note: "Compare body — focus comparison",
  },
];

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const brand = loadBrand("carephoto", path.resolve("brands"));
  const ds = loadDesignSystem(
    brand.designSystem ?? "editorial-paper",
    path.resolve("design-systems")
  );

  const results: Array<Example & { outputPath: string }> = [];
  for (let i = 0; i < examples.length; i++) {
    const ex = examples[i];
    console.log(`[${i + 1}/${examples.length}] ${ex.template} → ${ex.note}`);
    try {
      const outputPath = await renderCarouselCover({
        templateId: ex.template,
        slots: {
          kicker: ex.slots.kicker ?? null,
          headline: ex.slots.headline,
          accentWord: ex.slots.accentWord ?? null,
          subtitle: ex.slots.subtitle ?? null,
          decorativeChar: ex.slots.decorativeChar ?? null,
          stickerText: ex.slots.stickerText ?? null,
        },
        background: null,
        accentColor: ex.accentColor ?? null,
        pageNumber: ex.pageNumber ?? null,
        totalPages: ex.totalPages ?? null,
        branding: brand.branding!,
        brandDir: brand.brandDir,
        designSystemDir: ds.rootDir,
        instagramHandle: brand.instagramHandle ?? "careaiphotoeditor",
      });
      const fileName = `${String(i + 1).padStart(2, "0")}-${ex.template}.png`;
      const dest = path.join(OUT_DIR, fileName);
      fs.copyFileSync(outputPath, dest);
      results.push({ ...ex, outputPath: fileName });
    } catch (err) {
      console.error(`FAILED: ${err}`);
    }
  }

  const galleryHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Variety Templates — carephoto</title>
<style>
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f0f10; color: #e7e5e4; padding: 48px; }
  h1 { font-size: 32px; margin: 0 0 8px; font-weight: 600; }
  .subtitle { color: #a8a29e; margin-bottom: 40px; font-size: 16px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 32px; }
  .card { background: #1a1a1b; border-radius: 16px; overflow: hidden; border: 1px solid #27272a; }
  .card img { width: 100%; display: block; aspect-ratio: 1080 / 1350; object-fit: cover; background: #000; }
  .meta { padding: 16px 20px 20px; }
  .template-name { font-family: "SF Mono", Menlo, monospace; font-size: 13px; color: #fca5a5; margin-bottom: 6px; }
  .note { font-size: 15px; color: #e7e5e4; font-weight: 500; margin-bottom: 8px; }
  .slots { font-size: 13px; color: #a8a29e; line-height: 1.5; }
  .slots b { color: #d6d3d1; font-weight: 600; }
</style>
</head>
<body>
<h1>New editorial variety templates</h1>
<div class="subtitle">4 new templates × 2 variants each. Two cream covers + two dark body slides.</div>
<div class="grid">
${results
  .map(
    (r) => `  <div class="card">
    <a href="${r.outputPath}" target="_blank"><img src="${r.outputPath}" alt="${r.template}" /></a>
    <div class="meta">
      <div class="template-name">${r.template}${r.pageNumber ? `  ·  ${r.pageNumber}/${r.totalPages}` : ""}</div>
      <div class="note">${r.note}</div>
      <div class="slots">
        <b>kicker:</b> ${r.slots.kicker ?? "—"}<br>
        <b>headline:</b> ${r.slots.headline}<br>
        <b>accent:</b> ${r.slots.accentWord ?? "—"}<br>
        <b>subtitle:</b> ${r.slots.subtitle ?? "—"}<br>
        <b>decorativeChar:</b> ${r.slots.decorativeChar ?? "—"}<br>
        <b>sticker:</b> ${r.slots.stickerText ?? "—"}
      </div>
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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
