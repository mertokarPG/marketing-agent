import "dotenv/config";
import cron from "node-cron";
import path from "path";
import { loadBrand, brandSourcesPath } from "./config/load-brand.js";
import { createDatabase } from "./db/schema.js";
import { runAgent } from "./orchestrator.js";
import { sendNotification } from "./tools/notify.js";
import { detectTunnelUrl } from "./utils/detect-tunnel.js";
import { scrapeAllSources } from "./tools/scrape-hot-topics.js";

const brandId = process.env.BRAND ?? "carephoto";
const brandsDir = path.resolve("brands");
const dbPath = path.resolve("marketing-agent.db");

// Auto-detect Cloudflare quick tunnel URL if not set manually
if (!process.env.POSTIZ_TUNNEL_URL) {
  detectTunnelUrl();
}

async function dailyRun(): Promise<void> {
  let db;
  try {
    const brand = loadBrand(brandId, brandsDir);
    db = createDatabase(dbPath);

    // Refresh the trends table before the agent reads it. Best-effort: a
    // failing feed must not block the run — the agent will just see slightly
    // staler data.
    try {
      console.log(`[Agent] Scraping hot-topic sources for brand=${brand.id}…`);
      const t0 = Date.now();
      const stats = await scrapeAllSources(db, brandSourcesPath(brand));
      const total = stats.reduce((n, s) => n + s.inserted, 0);
      const failed = stats.filter((s) => s.error).length;
      console.log(
        `[Agent] Scrape done: ${total} items across ${stats.length} sources (${failed} failed) in ${Date.now() - t0}ms`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Agent] Hot-topics scrape failed (continuing): ${msg}`);
    }

    await runAgent(brand, db);
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : String(error);
    console.error(`[Agent] Fatal error: ${errorMsg}`);
    await sendNotification("Agent Error", `Fatal error during daily run: ${errorMsg}`);
  } finally {
    db?.close();
  }
}

const args = process.argv.slice(2);

if (args.includes("--run-now")) {
  console.log(`[Agent] Running immediately for brand: ${brandId}`);
  dailyRun();
} else {
  console.log(
    `[Agent] Scheduled daily run at 07:00 for brand: ${brandId}`
  );
  cron.schedule("0 7 * * *", () => {
    console.log(`[Agent] Cron triggered at ${new Date().toISOString()}`);
    dailyRun();
  });
}
