import "dotenv/config";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import puppeteer from "puppeteer";
import sharp from "sharp";
import { loadBrand } from "../src/config/load-brand.js";
import { loadDesignSystem, isReactJsx } from "../src/config/load-design-system.js";
import { renderReactSlide } from "../src/tools/react-slide.js";
import { schedulePost } from "../src/tools/schedule-post.js";
import { createDatabase } from "../src/db/schema.js";
import { insertPost } from "../src/db/queries.js";
import { detectTunnelUrl } from "../src/utils/detect-tunnel.js";

if (!process.env.POSTIZ_TUNNEL_URL) detectTunnelUrl();

const LULA_ROOT = "/Users/mertokar/Documents/GitHub/lula/public";

// Slide 1 is a dedicated Claude-branded intro cover (see renderClaudeIntroSlide).
// Atelier then skips its own bare cover (the intro stands in for it) and goes
// straight to applied. The remaining 4 systems each get a bare cover + applied
// pair. Total: 1 intro + 1 atelier applied + 4 × 2 = 10 slides, exactly at IG's
// carousel max.
const SHOWCASE = [
  {
    ds: "atelier",
    mode: "light" as const,
    mark: "ring" as const,
    skipCover: true,
    cover: {
      eyebrow: "SYSTEM 01 · MADE WITH CLAUDE",
      kicker: "editorial",
      title: "Atelier",
      subtitle: "Warm cream paper, italic serif, magazine-editorial composition.",
    },
    applied: {
      photo: "/promptbank/images/promptbank67.webp", // elegant-portrait-pearls
      title: "The Pearl Portrait",
      caption: "Editorial clarity without booking a studio.",
      imageLabel: "Plate 01",
    },
  },
  {
    ds: "nocturne",
    mode: "dark" as const,
    mark: "quad" as const,
    cover: {
      eyebrow: "SYSTEM 02 · MADE WITH CLAUDE",
      kicker: "avant-garde",
      title: "Nocturne",
      subtitle: "Ink-black canvas, electric-lime accents, nightclub-flyer energy.",
    },
    applied: {
      photo: "/promptbank/images/promptbank220.webp", // cyberpunk-street-neon-portrait
      title: "Night Shift",
      caption: "AI light, city grit — a late-hour look you couldn't shoot in daylight.",
      imageLabel: "Transmission 02",
    },
  },
  {
    ds: "bauhaus",
    mode: "light" as const,
    mark: "bar" as const,
    cover: {
      eyebrow: "SYSTEM 03 · MADE WITH CLAUDE",
      kicker: "geometric",
      title: "Bauhaus",
      subtitle: "Primary reds, hard geometry, 1920s-poster directness.",
    },
    applied: {
      photo: "/promptbank/images/promptbank112.webp", // album-cover-guitar-city
      title: "Bold Walk",
      caption: "Strong frames for statement portraits — posters, album art, covers.",
      imageLabel: "Plate 03",
    },
  },
  {
    ds: "couture",
    mode: "light" as const,
    mark: "ring" as const,
    cover: {
      eyebrow: "SYSTEM 04 · MADE WITH CLAUDE",
      kicker: "luxe magazine",
      title: "Couture",
      subtitle: "Oat paper, warm gold, Cormorant Garamond — high-fashion editorial.",
    },
    applied: {
      photo: "/promptbank/images/promptbank16.webp", // minimal-pantsuit-pink
      title: "Tailored",
      caption: "Luxe editorial polish for everyday selfies.",
      imageLabel: "Maison 04",
    },
  },
  {
    ds: "terminal",
    mode: "dark" as const,
    mark: "bar" as const,
    cover: {
      eyebrow: "SYSTEM 05 · MADE WITH CLAUDE",
      kicker: "CRT zine",
      title: "Terminal",
      subtitle: "Phosphor green on ink, monospace everything, late-80s-hacker vibe.",
    },
    applied: {
      photo: "/promptbank/images/promptbank95.webp", // futuristic-cybertruck-coupe
      title: "Rendered",
      caption: "Tech-zine aesthetic for product demos, launches, AI stuff.",
      imageLabel: "Output 05",
    },
  },
];

const CAPTION = `Claude Design is in the spotlight right now — and it's how we built our own carousel templates.

Swipe through 5 of the systems we ship with: Atelier, Nocturne, Bauhaus, Couture, Terminal. Each one is shown in its bare typographic form, then applied to a real carephoto post.

Every layout pairs with a photo from our library of 260+ AI-photo prompts at carephoto.art/prompt-bank.

Which aesthetic fits your feed?`;

const HASHTAGS = [
  "#claudedesign",
  "#designsystems",
  "#generativedesign",
  "#aitools",
  "#editorialdesign",
];

function fileToDataUrl(absPath: string): string {
  const ext = path.extname(absPath).slice(1).toLowerCase();
  const mime = ext === "webp" ? "image/webp" : ext === "png" ? "image/png" : "image/jpeg";
  const bytes = fs.readFileSync(absPath);
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

// Official Claude logo SVG sourced from Wikimedia Commons
// (Claude_AI_logo.svg, 690×148). Rendered at a fixed target width.
const CLAUDE_LOGO_PATH = path.resolve("assets/claude-logo.svg");
const CLAUDE_ORANGE = "#d97757";
const INTRO_TMP_DIR = path.resolve("tmp/react-slides");

// Dedicated intro cover: stark black, bold sans "CLAUDE DESIGN" hero,
// Claude-orange accent line, Anthropic eyebrow, Claude logo stamp.
async function renderClaudeIntroSlide(opts: {
  handle: string;
  totalPages: number;
}): Promise<string> {
  if (!fs.existsSync(INTRO_TMP_DIR)) fs.mkdirSync(INTRO_TMP_DIR, { recursive: true });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
  html, body { margin: 0; padding: 0; background: #0a0a0a; overflow: hidden; font-family: 'Inter', sans-serif; color: #fff; }
  #root { width: 1080px; height: 1350px; position: relative; }
  *, *::before, *::after { box-sizing: border-box; }
</style>
</head>
<body>
<div id="root">
  <div style="position:absolute; top:56px; left:56px; padding:7px 14px; border:1px solid rgba(255,255,255,0.28); font-family:'JetBrains Mono',monospace; font-size:13px; letter-spacing:0.22em; text-transform:uppercase; font-weight:500;">
    Made with Claude
  </div>
  <div style="position:absolute; top:68px; left:0; right:0; text-align:center; font-family:'JetBrains Mono',monospace; font-size:13px; letter-spacing:0.28em; text-transform:uppercase; color:rgba(255,255,255,0.55);">
    Anthropic's Design System
  </div>
  <div style="position:absolute; top:68px; right:56px; font-family:'JetBrains Mono',monospace; font-size:13px; letter-spacing:0.22em; text-transform:uppercase; color:rgba(255,255,255,0.55);">
    01 / ${String(opts.totalPages).padStart(2, "0")}
  </div>

  <div style="position:absolute; left:56px; right:56px; top:300px; font-weight:900; font-size:260px; line-height:0.86; letter-spacing:-0.055em; text-transform:uppercase; color:#ffffff;">
    Claude<br/>Design
  </div>

  <div style="position:absolute; left:56px; right:56px; top:900px; display:flex; gap:26px; align-items:flex-start;">
    <div style="width:8px; height:120px; background:${CLAUDE_ORANGE}; margin-top:6px; flex-shrink:0;"></div>
    <div>
      <div style="font-weight:800; font-size:36px; letter-spacing:-0.02em; color:${CLAUDE_ORANGE}; text-transform:uppercase; line-height:1.08;">
        5 Systems.<br/>One Library.
      </div>
      <div style="margin-top:14px; font-weight:700; font-size:24px; letter-spacing:-0.005em; color:#fff; text-transform:uppercase; line-height:1.2;">
        Swipe to see them all →
      </div>
    </div>
  </div>

  <div style="position:absolute; bottom:56px; left:56px; right:56px; display:flex; justify-content:space-between; align-items:center; font-family:'JetBrains Mono',monospace; font-size:12px; letter-spacing:0.22em; text-transform:uppercase; color:rgba(255,255,255,0.55);">
    <span>${opts.handle} · carephoto.art</span>
    <span>Carousel · ${String(opts.totalPages).padStart(2, "0")} slides</span>
  </div>
</div>
<script>
  document.fonts.ready.then(() => {
    requestAnimationFrame(() => document.body.setAttribute('data-ready', '1'));
  });
</script>
</body>
</html>`;

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    timeout: 20000,
    protocolTimeout: 40000,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 20000 });
    await page.waitForFunction(() => document.body.hasAttribute("data-ready"), { timeout: 15000 });

    const rawPath = path.join(INTRO_TMP_DIR, `claude-intro-${randomUUID()}.png`);
    await page.screenshot({
      path: rawPath as `${string}.png`,
      type: "png",
      omitBackground: false,
      clip: { x: 0, y: 0, width: 1080, height: 1350 },
    });

    // Composite the real Claude wordmark in the top-right, below the page counter.
    // The source SVG uses #0f0f0d for the wordmark and #d97757 for the asterisk;
    // swap the black to white at the SVG level so it reads on our black canvas.
    const finalPath = rawPath.replace(/\.png$/, "-logo.png");
    const logoWidth = 340;
    const rawSvg = fs.readFileSync(CLAUDE_LOGO_PATH, "utf-8");
    const whiteSvg = Buffer.from(rawSvg.replace(/#0f0f0d/gi, "#ffffff"));
    const logoPng = await sharp(whiteSvg)
      .resize({ width: logoWidth })
      .png()
      .toBuffer();
    await sharp(rawPath)
      .composite([
        {
          input: logoPng,
          top: 160,
          left: 1080 - 56 - logoWidth,
        },
      ])
      .flatten({ background: "#0a0a0a" })
      .removeAlpha()
      .png()
      .toFile(finalPath);
    return finalPath;
  } finally {
    await browser.close();
  }
}

async function main() {
  const publish = process.argv.includes("--publish");
  const brandId = process.env.BRAND ?? "carephoto";
  const brandsDir = path.resolve("brands");
  const designSystemsDir = path.resolve("design-systems");

  const brand = loadBrand(brandId, brandsDir);
  const handle = `@${brand.instagramHandle ?? brand.id}`;
  const year = String(new Date().getFullYear());
  // 1 intro + 1 atelier-applied + 4 pairs = 10 slides.
  const total = 1 + SHOWCASE.reduce(
    (acc, s) => acc + ("skipCover" in s && s.skipCover ? 1 : 2),
    0,
  );

  console.log(`[showcase] Rendering ${total} slides for ${brand.name}...`);

  const paths: string[] = [];
  let slideIdx = 0;

  // ── Slide 1: Claude Design intro cover ────────────────────────────────────
  slideIdx++;
  const introPath = await renderClaudeIntroSlide({ handle, totalPages: total });
  paths.push(introPath);
  console.log(`  [${slideIdx}/${total}] claude-intro → ${introPath}`);

  for (const s of SHOWCASE) {
    const ds = loadDesignSystem(s.ds, designSystemsDir);
    if (!isReactJsx(ds)) throw new Error(`${s.ds} is not a react-jsx system`);

    const skipCover = "skipCover" in s && s.skipCover;

    // ── Bare cover slide ─────────────────────────────────────────────────────
    if (!skipCover) {
      slideIdx++;
      const coverOut = await renderReactSlide({
        designSystem: ds,
        slideKind: "cover",
        slide: { ...s.cover, cta: "" },
        handle,
        year,
        mode: s.mode,
        markVariant: s.mark,
        pageNumber: slideIdx,
        totalPages: total,
        customAccent: null,
      });
      paths.push(coverOut);
      console.log(`  [${slideIdx}/${total}] ${s.ds} cover → ${coverOut}`);
    }

    // ── Applied image slide with real photo ──────────────────────────────────
    slideIdx++;
    const photoPath = path.join(LULA_ROOT, s.applied.photo);
    const photoDataUrl = fileToDataUrl(photoPath);
    const imgOut = await renderReactSlide({
      designSystem: ds,
      slideKind: "image",
      slide: {
        title: s.applied.title,
        caption: s.applied.caption,
        imageLabel: s.applied.imageLabel,
        imageSrc: photoDataUrl,
      },
      handle,
      year,
      mode: s.mode,
      markVariant: s.mark,
      pageNumber: slideIdx,
      totalPages: total,
      customAccent: null,
    });
    paths.push(imgOut);
    console.log(`  [${slideIdx}/${total}] ${s.ds} applied → ${imgOut}`);
  }

  const fullCaption = CAPTION + "\n\n" + HASHTAGS.join(" ");
  console.log("\n=== CAPTION PREVIEW ===\n");
  console.log(fullCaption);
  console.log("\n=== IMAGES ===");
  paths.forEach((p, i) => console.log(`  slide ${i + 1}: ${p}`));

  if (!publish) {
    console.log("\n[showcase] Dry run. Pass --publish to schedule via Postiz.");
    return;
  }

  const sched = new Date();
  sched.setHours(17, 0, 0, 0);
  const scheduledTime = sched.toISOString();
  console.log(`\n[showcase] Publishing via Postiz (scheduled: ${scheduledTime})...`);
  const result = await schedulePost({
    caption: CAPTION,
    hashtags: HASHTAGS,
    images: paths,
    scheduledTime,
  });
  console.log(`[showcase] ${result.ok ? "✓" : "✗"} ${result.message}`);

  if (result.ok) {
    const db = createDatabase(path.resolve("marketing-agent.db"));
    try {
      insertPost(db, {
        brand_id: brand.id,
        caption: CAPTION,
        hashtags: HASHTAGS,
        image_url: paths[0],
        content_theme: "claude-design-showcase",
        posted_at: scheduledTime,
        external_post_id: result.postizId,
        source_images: [],
      });
      console.log("[showcase] Post recorded in DB.");
    } finally {
      db.close();
    }
  }
}

main().catch((err) => {
  console.error("[showcase] FATAL:", err);
  process.exit(1);
});
