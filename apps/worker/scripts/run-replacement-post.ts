import "dotenv/config";
import path from "path";
import { loadBrand, brandSourcesPath } from "../src/config/load-brand.js";
import { createDatabase } from "../src/db/schema.js";
import { runAgent } from "../src/orchestrator.js";
import { detectTunnelUrl } from "../src/utils/detect-tunnel.js";
import { scrapeAllSources } from "../src/tools/scrape-hot-topics.js";

if (!process.env.POSTIZ_TUNNEL_URL) detectTunnelUrl();

async function main() {
  const brandId = process.env.BRAND ?? "carephoto";
  const brandsDir = path.resolve("brands");
  const dbPath = path.resolve("marketing-agent.db");

  const brand = loadBrand(brandId, brandsDir);
  const db = createDatabase(dbPath);

  try {
    await scrapeAllSources(db, brandSourcesPath(brand));
  } catch (err) {
    console.warn(
      `[e2e-test] scrape failed (continuing): ${err instanceof Error ? err.message : err}`
    );
  }

  const earliestSchedule = new Date(Date.now() + 60 * 60 * 1000);
  const latestSchedule = new Date();
  latestSchedule.setUTCHours(23, 0, 0, 0);

  const brief = [
    `End-to-end TEST POST for ${brand.name}, ${new Date().toISOString().split("T")[0]}.`,
    ``,
    `GOAL: Exercise the new prompt-bank-grounded compose_image_prompt → generate_image`,
    `pipeline. We just rewrote the composer to learn from prompt-bank exemplars`,
    `instead of using banned-token rules — we want to see what production output`,
    `looks like with the new aesthetic.`,
    ``,
    `HARD REQUIREMENTS:`,
    `1. Pillar: pick whatever fits best (Trending, Engagement Bait, Educational,`,
    `   or Social Proof). Pull a fresh angle from get_trending_topics or`,
    `   get_hot_topics. Two posts already went out today (16:00 + 18:00 UTC) —`,
    `   pick a DIFFERENT angle from those.`,
    `2. Visual: MUST call compose_image_prompt FIRST, then pass its prompt +`,
    `   recommendedModel directly to generate_image. Do NOT skip the composer`,
    `   and write your own prompt. Single hero image OR carousel (2–4 slides)`,
    `   both fine. Pick whichever model the composer recommends.`,
    `3. Branding: every generate_image output MUST go through brand_image OR`,
    `   photo_overlay OR brand_carousel before scheduling. Raw model output is`,
    `   not acceptable — we want the standard branded look.`,
    `4. Schedule between ${earliestSchedule.toISOString()} and`,
    `   ${latestSchedule.toISOString()} (UTC).`,
    `5. promptIds: empty array (these are not prompt-bank images).`,
    `6. Send a notification at the end summarising:`,
    `     - chosen pillar + angle`,
    `     - the EXACT prompt the composer produced (full text)`,
    `     - which model the composer recommended + why`,
    `     - total credits/USD spent on image gen`,
    `     - branding tool(s) used`,
    `     - the scheduled time + Postiz post ID`,
    ``,
    `Be efficient — get to compose_image_prompt → generate_image → branding →`,
    `schedule_post → notification quickly. Don't over-research.`,
  ].join("\n");

  console.log("======================================================");
  console.log(`[e2e-test] brand:           ${brand.name} (${brand.id})`);
  console.log(`[e2e-test] schedule window: ${earliestSchedule.toISOString()} → ${latestSchedule.toISOString()}`);
  console.log("======================================================");
  console.log("[e2e-test] BRIEF:");
  console.log(brief);
  console.log("======================================================");

  try {
    await runAgent(brand, db, { userBrief: brief, maxIterations: 22 });
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error("[e2e-test] FATAL:", err);
  process.exit(1);
});
