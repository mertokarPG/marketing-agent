import path from "path";
import dotenv from "dotenv";
dotenv.config();
import { createDatabase } from "../src/db/schema.js";
import { loadBrand } from "../src/config/load-brand.js";
import { ingestAnalytics } from "../src/tools/ingest-analytics.js";
import { getPostPerformanceTool } from "../src/tools/post-performance.js";

async function main() {
  const brand = loadBrand("carephoto", path.resolve("brands"));
  const db = createDatabase(path.resolve("marketing-agent.db"));

  const before = db
    .prepare(
      `SELECT COUNT(*) AS n, SUM(CASE WHEN external_post_id IS NOT NULL AND external_post_id != '' THEN 1 ELSE 0 END) AS with_id FROM posts WHERE brand_id = ?`
    )
    .get(brand.id) as { n: number; with_id: number };
  console.log(`Before: ${before.n} posts, ${before.with_id} with external_post_id`);

  const result = await ingestAnalytics(brand, db);
  console.log(`Result:`, result);

  const after = db
    .prepare(
      `SELECT COUNT(*) AS n, SUM(CASE WHEN external_post_id IS NOT NULL AND external_post_id != '' THEN 1 ELSE 0 END) AS with_id FROM posts WHERE brand_id = ?`
    )
    .get(brand.id) as { n: number; with_id: number };
  console.log(`After:  ${after.n} posts, ${after.with_id} with external_post_id`);

  const analyticsCount = db
    .prepare(`SELECT COUNT(*) AS n FROM analytics WHERE brand_id = ?`)
    .get(brand.id) as { n: number };
  console.log(`Analytics rows: ${analyticsCount.n}`);

  console.log("\n--- get_post_performance output ---");
  console.log(getPostPerformanceTool(db, brand.id, 5));

  db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
