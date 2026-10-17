import fs from "fs";
import path from "path";
import { loadDesignSystem, isReactJsx } from "../src/config/load-design-system.js";
import { renderReactSlide, type SlideKind } from "../src/tools/react-slide.js";

const OUT_DIR = path.resolve("tmp/react-gallery");
const SYSTEMS = [
  "atelier",
  "signal",
  "mute",
  "gridos",
  "bloom",
  "nocturne",
  "archive",
  "riso",
  "vapor",
  "bauhaus",
  "terminal",
  "couture",
] as const;

const SLIDES: Record<SlideKind, Record<string, unknown>> = {
  cover: {
    eyebrow: "Issue № 04",
    kicker: "A field guide",
    title: "The quiet ritual of pour-over coffee",
    subtitle: "Five things we learned roasting 200 lbs of single-origin beans in our garage.",
    cta: "Swipe →",
  },
  intro: {
    eyebrow: "Context",
    title: "Why slow coffee is making a comeback",
    body: "In a year of 40-second everything, the four-minute pour became our most-requested drink. Here is what the data — and our regulars — told us about the shift.",
    meta: "3 min read",
  },
  numbered: {
    number: "01",
    label: "Principle",
    title: "Water matters more than the bean",
    body: "Filtered water at 94°C produces measurably sweeter extractions. We tested 12 sources — the difference between tap and remineralised was larger than the difference between two roast levels.",
  },
  stat: {
    big: "4:12",
    unit: "minutes",
    caption: "The pour time that scored highest across 340 blind tastings this quarter.",
    footnote: "Median across Kalita, V60, and Origami brewers.",
  },
  list: {
    title: "The kit we actually use",
    items: [
      { n: "01", label: "Kettle", v: "Fellow Stagg EKG" },
      { n: "02", label: "Grinder", v: "Comandante C40" },
      { n: "03", label: "Scale", v: "Acaia Pearl S" },
      { n: "04", label: "Brewer", v: "Origami M" },
      { n: "05", label: "Filter", v: "Cafec Abaca" },
      { n: "06", label: "Cloth", v: "Linen, natural" },
    ],
  },
  image: {
    title: "Bloom, then pour",
    caption: "Wet the grounds with twice their weight in water. Wait 35 seconds.",
    imageLabel: "pour-over photograph",
  },
  cta: {
    title: "Save this for your next Sunday",
    body: "We publish a new field guide every other Friday. Follow for the next one.",
    handleCta: "Follow for more",
    saveCta: "Save for later",
  },
};

const KINDS: SlideKind[] = ["cover", "intro", "numbered", "stat", "list", "image", "cta"];

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  type Row = { system: string; kind: SlideKind; file: string };
  const rows: Row[] = [];

  for (const id of SYSTEMS) {
    const ds = loadDesignSystem(id, path.resolve("design-systems"));
    if (!isReactJsx(ds)) continue;
    for (let i = 0; i < KINDS.length; i++) {
      const kind = KINDS[i];
      const slide = SLIDES[kind];
      try {
        const out = await renderReactSlide({
          designSystem: ds,
          slideKind: kind,
          slide,
          handle: "@slowbrew.studio",
          year: "2026",
          mode: "light",
          markVariant: "quad",
          pageNumber: i + 1,
          totalPages: KINDS.length,
        });
        const fileName = `${id}-${String(i + 1).padStart(2, "0")}-${kind}.png`;
        const dest = path.join(OUT_DIR, fileName);
        fs.copyFileSync(out, dest);
        rows.push({ system: id, kind, file: fileName });
      } catch (err) {
        console.error(`FAILED ${id}/${kind}:`, err);
      }
    }
  }

  // Gallery HTML — grouped by design system, horizontal strips
  const bySystem = SYSTEMS.map((id) => ({
    id,
    rows: rows.filter((r) => r.system === id),
  }));

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>React-JSX Design Systems — carousel gallery</title>
<style>
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #0a0a0a; color: #e7e5e4; padding: 48px; }
  h1 { font-size: 28px; margin: 0 0 32px; font-weight: 600; }
  .system { margin-bottom: 56px; }
  .system-header { display: flex; align-items: baseline; gap: 14px; margin-bottom: 14px; }
  .system-name { font-size: 20px; font-weight: 600; letter-spacing: -0.01em; }
  .system-meta { font-family: "SF Mono", Menlo, monospace; font-size: 12px; color: #6b6b6b; letter-spacing: 0.06em; text-transform: uppercase; }
  .strip { display: grid; grid-template-columns: repeat(${KINDS.length}, 1fr); gap: 10px; }
  .slot { background: #141414; border-radius: 10px; overflow: hidden; border: 1px solid #1f1f1f; }
  .slot img { width: 100%; display: block; aspect-ratio: 1080/1350; object-fit: cover; background: #000; }
  .slot .label { padding: 8px 10px; font-family: "SF Mono", Menlo, monospace; font-size: 10px; color: #8a8a8a; letter-spacing: 0.08em; text-transform: uppercase; display: flex; justify-content: space-between; }
</style>
</head>
<body>
<h1>React-JSX design systems — one carousel per system</h1>
${bySystem
  .map(
    (s) => `<div class="system">
  <div class="system-header">
    <div class="system-name">${s.id.toUpperCase()}</div>
    <div class="system-meta">${s.rows.length} slides · react-jsx</div>
  </div>
  <div class="strip">
    ${s.rows
      .map(
        (r) => `<div class="slot">
      <a href="${r.file}" target="_blank"><img src="${r.file}" alt="${r.kind}" /></a>
      <div class="label"><span>${r.kind}</span></div>
    </div>`
      )
      .join("\n    ")}
  </div>
</div>`
  )
  .join("\n")}
</body>
</html>`;

  const galleryPath = path.join(OUT_DIR, "gallery.html");
  fs.writeFileSync(galleryPath, html);
  console.log(`\n✓ Gallery: ${galleryPath}`);
  console.log(`Rendered ${rows.length} slides across ${SYSTEMS.length} systems.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
