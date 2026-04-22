import fs from "fs";
import path from "path";
import { loadBrand } from "../src/config/load-brand.js";
import { loadDesignSystem } from "../src/config/load-design-system.js";
import { renderPhotoOverlay, type PhotoOverlayTemplate } from "../src/tools/photo-overlay.js";

const OUT_DIR = path.resolve("tmp/photo-examples");

interface Example {
  template: PhotoOverlayTemplate;
  photo: string;
  slots: {
    kicker?: string | null;
    headline: string;
    accentWord?: string | null;
    subtitle?: string | null;
  };
  accentColor?: string | null;
  note: string;
}

const PROMPT_BANK_DIR = "/Users/mertokar/Documents/GitHub/lula/public/promptbank/images";

// Pick 3 photos with different subjects for variety
const photos = {
  portrait1: path.join(PROMPT_BANK_DIR, "promptbank1.webp"),
  portrait2: path.join(PROMPT_BANK_DIR, "promptbank10.webp"),
  portrait3: path.join(PROMPT_BANK_DIR, "promptbank100.webp"),
};

const examples: Example[] = [
  // photo-caption-bar — bottom cream bar with serif headline
  {
    template: "photo-caption-bar",
    photo: photos.portrait1,
    slots: {
      kicker: "DATING PROFILE TIPS",
      headline: "Your photo speaks before you do.",
      accentWord: "speaks",
      subtitle: "One AI edit is enough to change how the first 0.3 seconds of a profile view feels.",
    },
    note: "Cream caption bar — editorial magazine feel",
  },
  {
    template: "photo-caption-bar",
    photo: photos.portrait2,
    slots: {
      kicker: "THE PHOTO AUDIT",
      headline: "Sharpness matters more than beauty.",
      accentWord: "Sharpness",
      subtitle: null,
    },
    note: "Cream bar, no subtitle — tight and punchy",
  },

  // photo-quote-center — centered italic serif quote with cinematic scrim
  {
    template: "photo-quote-center",
    photo: photos.portrait3,
    slots: {
      kicker: null,
      headline: "First impressions happen in 0.3 seconds.",
      accentWord: "0.3 seconds",
      subtitle: "carephoto.art",
    },
    note: "Cinematic center quote — attention-grabbing",
  },
  {
    template: "photo-quote-center",
    photo: photos.portrait1,
    slots: {
      kicker: null,
      headline: "The best light in your life is the one you never took the time to find.",
      accentWord: "best light",
      subtitle: "AI Photo Studio",
    },
    note: "Longer quote — manifesto style",
  },

  // photo-editorial-stack — top-left kicker + huge serif headline
  {
    template: "photo-editorial-stack",
    photo: photos.portrait2,
    slots: {
      kicker: "ISSUE 07",
      headline: "The profile that changes everything.",
      accentWord: "everything",
      subtitle: "How one AI-enhanced photo reshaped Sarah's match rate within 48 hours.",
    },
    note: "Magazine cover — big editorial serif",
  },
  {
    template: "photo-editorial-stack",
    photo: photos.portrait3,
    slots: {
      kicker: "AI x PORTRAITS",
      headline: "Studio quality. Phone simplicity.",
      accentWord: "simplicity",
      subtitle: null,
    },
    note: "Editorial stack — no subtitle",
  },

  // photo-chip-corner — small cream chip bottom-right
  {
    template: "photo-chip-corner",
    photo: photos.portrait1,
    slots: {
      kicker: "NEW",
      headline: "Try the prompt bank",
      accentWord: null,
      subtitle: "260+ free prompts at carephoto.art",
    },
    note: "Minimal chip — photo breathes, caption whispers",
  },
  {
    template: "photo-chip-corner",
    photo: photos.portrait2,
    slots: {
      kicker: "DID YOU KNOW",
      headline: "3× more matches on average",
      accentWord: "3×",
      subtitle: null,
    },
    note: "Chip — stat callout",
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
      const outputPath = await renderPhotoOverlay({
        templateId: ex.template,
        photoSource: ex.photo,
        slots: ex.slots,
        accentColor: ex.accentColor,
        pageNumber: null,
        totalPages: null,
        branding: brand.branding!,
        brandDir: brand.brandDir,
        designSystemDir: ds.rootDir,
        instagramHandle: brand.instagramHandle ?? "careaiphotoeditor",
      });
      // Copy to gallery dir with predictable name
      const fileName = `${String(i + 1).padStart(2, "0")}-${ex.template}.png`;
      const dest = path.join(OUT_DIR, fileName);
      fs.copyFileSync(outputPath, dest);
      results.push({ ...ex, outputPath: fileName });
    } catch (err) {
      console.error(`FAILED: ${err}`);
    }
  }

  // Gallery HTML
  const galleryHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Photo Overlay Examples — carephoto</title>
<style>
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #0f0f10;
    color: #e7e5e4;
    padding: 48px;
  }
  h1 { font-size: 32px; margin: 0 0 8px; font-weight: 600; }
  .subtitle { color: #a8a29e; margin-bottom: 40px; font-size: 16px; }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
    gap: 32px;
  }
  .card {
    background: #1a1a1b;
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid #27272a;
  }
  .card img {
    width: 100%;
    display: block;
    aspect-ratio: 1080 / 1350;
    object-fit: cover;
    background: #000;
  }
  .meta {
    padding: 16px 20px 20px;
  }
  .template-name {
    font-family: "SF Mono", Menlo, monospace;
    font-size: 13px;
    color: #fca5a5;
    margin-bottom: 6px;
  }
  .note {
    font-size: 15px;
    color: #e7e5e4;
    font-weight: 500;
    margin-bottom: 8px;
  }
  .slots {
    font-size: 13px;
    color: #a8a29e;
    line-height: 1.5;
  }
  .slots b { color: #d6d3d1; font-weight: 600; }
</style>
</head>
<body>
<h1>Photo overlay examples</h1>
<div class="subtitle">4 templates × 2 variants each. Click to open full-size.</div>
<div class="grid">
${results
  .map(
    (r) => `  <div class="card">
    <a href="${r.outputPath}" target="_blank"><img src="${r.outputPath}" alt="${r.template}" /></a>
    <div class="meta">
      <div class="template-name">${r.template}</div>
      <div class="note">${r.note}</div>
      <div class="slots">
        <b>kicker:</b> ${r.slots.kicker ?? "—"}<br>
        <b>headline:</b> ${r.slots.headline}<br>
        <b>accent:</b> ${r.slots.accentWord ?? "—"}<br>
        <b>subtitle:</b> ${r.slots.subtitle ?? "—"}
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
  console.log(`\n✓ Gallery ready: ${galleryPath}`);
  console.log(`Open with: open ${galleryPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
