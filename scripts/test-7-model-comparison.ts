import "dotenv/config";
import path from "path";
import { loadBrand, brandSourcesPath } from "../src/config/load-brand.js";
import { createDatabase } from "../src/db/schema.js";
import { runAgent } from "../src/orchestrator.js";
import { detectTunnelUrl } from "../src/utils/detect-tunnel.js";
import { scrapeAllSources } from "../src/tools/scrape-hot-topics.js";

if (!process.env.POSTIZ_TUNNEL_URL) detectTunnelUrl();

const HOURS_AHEAD = 3;

const MODELS = [
  "nano-banana-2",
  "nano-banana-pro",
  "flux-lora",
  "recraft",
  "seedream-v5-lite",
  "qwen-image-2-pro",
  "gpt-image-2",
];

async function main() {
  const brandId = process.env.BRAND ?? "carephoto";
  const brandsDir = path.resolve("brands");
  const dbPath = path.resolve("marketing-agent.db");

  const brand = loadBrand(brandId, brandsDir);
  const db = createDatabase(dbPath);

  // Refresh hot topics best-effort, same as the daily run.
  try {
    await scrapeAllSources(db, brandSourcesPath(brand));
  } catch (err) {
    console.warn(
      `[test-7-model] scrape failed (continuing): ${err instanceof Error ? err.message : err}`
    );
  }

  const scheduledAt = new Date(Date.now() + HOURS_AHEAD * 60 * 60 * 1000);
  const scheduledIso = scheduledAt.toISOString();

  const brief = [
    `TEST RUN — model-comparison post for ${brand.name}.`,
    ``,
    `This is a special one-off post that intentionally violates the usual carousel`,
    `rule "do not generate every slide". For THIS post only, every slide is a`,
    `freshly generated image so we can compare all 7 carephoto image models`,
    `side-by-side using the SAME prompt.`,
    ``,
    `Steps:`,
    `1. Pick ONE strong creative prompt that reads well across photoreal,`,
    `   stylized, and typography-leaning models. Pick something on-brand for`,
    `   carephoto (a portrait, fashion, editorial, or product scene). Do NOT`,
    `   include house-style modifiers — carephoto adds those server-side. The`,
    `   SAME prompt and the SAME aspectRatio ("4:5") must be used for every call.`,
    `2. Call generate_image SEVEN times — once per model — with that identical`,
    `   prompt. Use these models in this exact order:`,
    `   ${MODELS.map((m, i) => `${i + 1}. ${m}`).join(", ")}.`,
    `3. Keep the returned imageUrl from each call. Do NOT pass them through`,
    `   brand_image / brand_carousel — we want the raw model output. The 7`,
    `   image URLs go directly into schedule_post 'images[]' as a 7-slide carousel,`,
    `   in the same order as the models above.`,
    `4. Write a caption that:`,
    `   - Frames the post as "same prompt, 7 models" so the audience knows what`,
    `     they're looking at.`,
    `   - Quotes the exact prompt you used.`,
    `   - Lists which model is on which slide (1→7) so viewers can follow along.`,
    `   - Ends with a soft CTA pointing to carephoto.art.`,
    `5. Pick 5–8 relevant hashtags.`,
    `6. Call schedule_post with scheduledTime EXACTLY "${scheduledIso}"`,
    `   (this is ${HOURS_AHEAD}h from now, ${scheduledAt.toString()}).`,
    `   promptIds: [] — none of these are prompt-bank images.`,
    `7. Send a notification summarising: the prompt used, the 7 models, the`,
    `   total credits/USD spent (sum of creditsUsed across the 7 generate_image`,
    `   calls), and the scheduled time.`,
    ``,
    `Skip competitor research, trend scraping, performance review, and prompt`,
    `bank browsing for this run — the only deliverable is the comparison post.`,
    `Do NOT call browse_prompt_bank or any analytics tools. Go directly from`,
    `picking the prompt to the 7 generate_image calls to schedule_post to the`,
    `notification.`,
  ].join("\n");

  console.log("======================================================");
  console.log(`[test-7-model] brand:        ${brand.name} (${brand.id})`);
  console.log(`[test-7-model] scheduled at: ${scheduledIso}`);
  console.log(`[test-7-model] (~${scheduledAt.toString()})`);
  console.log(`[test-7-model] models:       ${MODELS.join(", ")}`);
  console.log("======================================================");
  console.log("[test-7-model] BRIEF:");
  console.log(brief);
  console.log("======================================================");

  try {
    await runAgent(brand, db, { userBrief: brief, maxIterations: 25 });
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error("[test-7-model] FATAL:", err);
  process.exit(1);
});
