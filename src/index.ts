import "dotenv/config";
import cron from "node-cron";
import path from "path";
import { loadBrand } from "./config/load-brand.js";
import { createDatabase } from "./db/schema.js";
import { runAgent } from "./orchestrator.js";
import { sendNotification } from "./tools/notify.js";
import { detectTunnelUrl } from "./utils/detect-tunnel.js";

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
