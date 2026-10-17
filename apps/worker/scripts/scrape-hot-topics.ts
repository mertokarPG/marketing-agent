import "dotenv/config";
import path from "path";
import { createDatabase } from "../src/db/schema.js";
import { scrapeAllSources } from "../src/tools/scrape-hot-topics.js";
import { loadBrand, brandSourcesPath } from "../src/config/load-brand.js";

async function main() {
  const brandId = process.env.BRAND ?? "carephoto";
  const brand = loadBrand(brandId, path.resolve("brands"));
  const dbPath = path.resolve("marketing-agent.db");
  const db = createDatabase(dbPath);
  try {
    console.log(
      `[scrape-hot-topics] Starting scrape at ${new Date().toISOString()} for brand=${brand.id}`
    );
    const stats = await scrapeAllSources(db, brandSourcesPath(brand));
    const total = stats.reduce((a, s) => a + s.inserted, 0);
    const ok = stats.filter((s) => !s.error).length;
    const failed = stats.length - ok;
    console.log(
      `\n[scrape-hot-topics] Done. ${total} items across ${ok}/${stats.length} sources (${failed} failed).`
    );
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error("[scrape-hot-topics] FATAL:", err);
  process.exit(1);
});
