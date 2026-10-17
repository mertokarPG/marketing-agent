import fs from "fs";
import path from "path";
import { loadBrand } from "../src/config/load-brand.js";
import { loadDesignSystem } from "../src/config/load-design-system.js";
import { renderCarouselCover } from "../src/tools/carousel-cover.js";

const OUT_DIR = path.resolve("tmp/dark-examples");

interface Example {
  template: "dark-hero-cover" | "dark-list-body";
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
  // dark-hero-cover ————————————————————————————————————
  {
    template: "dark-hero-cover",
    slots: {
      kicker: "Did you know?",
      headline: "Every photo has a story.",
      accentWord: "a story",
      subtitle: null,
      stickerText: "Find out",
    },
    accentColor: "#ff5f5f",
    note: "Cover — handwritten kicker + serif accent + blue sticker",
  },
  {
    template: "dark-hero-cover",
    slots: {
      kicker: "The audit",
      headline: "Is your profile costing you matches?",
      accentWord: "costing you",
      subtitle: null,
      stickerText: null,
    },
    accentColor: "#ffcc5f",
    note: "Cover — no sticker, warm accent",
  },
  {
    template: "dark-hero-cover",
    slots: {
      kicker: "Monday",
      headline: "Recruiters are scrolling right now.",
      accentWord: "right now",
      subtitle: "Is your headshot doing the work for you?",
      stickerText: null,
    },
    accentColor: "#8ab4ff",
    note: "Cover — with supporting subtitle",
  },
  {
    template: "dark-hero-cover",
    slots: {
      kicker: "Creator Tooling",
      headline: "AI photo tools just hit a $500M moment",
      accentWord: "moment",
      subtitle: "ComfyUI raised $30M. The creator toolkit arms race is on.",
      stickerText: "We're ready",
    },
    accentColor: "#1f6feb",
    note: "Cover — REGRESSION CASE: long wrapped headline + subtitle + sticker (sticker used to overlap headline; fixed by anchoring sticker to bottom-right above footer 2026-04-26)",
  },

  // dark-list-body ————————————————————————————————————
  {
    template: "dark-list-body",
    slots: {
      kicker: "Tip 3",
      headline: "Humanist Sans",
      accentWord: null,
      subtitle: "Gill Sans | Optima | Aboreto",
      decorativeChar: "Friendly, approachable, honest | Feels like a person talking | Avoid when you need luxury",
    },
    pageNumber: 3,
    totalPages: 5,
    accentColor: "#f5e14a",
    note: "Body — pill-chip row + arrow-bullet list + top progress (3/5)",
  },
  {
    template: "dark-list-body",
    slots: {
      kicker: "Tip 2",
      headline: "The Angle Test",
      accentWord: null,
      subtitle: null,
      decorativeChar: "Eye-level is neutral | Slight tilt = approachable | Low angle = authoritative",
    },
    pageNumber: 2,
    totalPages: 5,
    accentColor: "#ff7a5a",
    note: "Body — bullet list only, no chips (progress 2/5)",
  },
  {
    template: "dark-list-body",
    slots: {
      kicker: "Tip 4",
      headline: "Know your light.",
      accentWord: "light",
      subtitle: "Golden hour | Overcast | Soft indoor",
      decorativeChar: null,
    },
    pageNumber: 4,
    totalPages: 5,
    accentColor: "#7fe3b9",
    note: "Body — chip row only (progress 4/5)",
  },
  {
    template: "dark-list-body",
    slots: {
      kicker: "Recap",
      headline: "Four small fixes, one big difference.",
      accentWord: "big difference",
      subtitle: "A recap of everything above, in one slide. Take what fits your profile and leave the rest — there are no rules, only tests.",
      decorativeChar: null,
    },
    pageNumber: 5,
    totalPages: 5,
    accentColor: "#ff5f5f",
    note: "Body — plain subtitle paragraph (final slide 5/5)",
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
<title>Dark Editorial Templates — carephoto</title>
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
  .meta { padding: 16px 20px 20px; }
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
<h1>Dark editorial templates</h1>
<div class="subtitle">2 new templates: dark-hero-cover (3 variants) + dark-list-body (4 variants). Click to open full-size.</div>
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
  console.log(`\n✓ Gallery ready: ${galleryPath}`);
  console.log(`Open with: open ${galleryPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
