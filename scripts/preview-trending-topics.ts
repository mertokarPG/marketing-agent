import "dotenv/config";
import path from "path";
import { createDatabase } from "../src/db/schema.js";
import { getTrendingTopics } from "../src/tools/trending-topics.js";
import { loadBrand } from "../src/config/load-brand.js";

const brandId = process.env.BRAND ?? "carephoto";
const brand = loadBrand(brandId, path.resolve("brands"));
const db = createDatabase(path.resolve("marketing-agent.db"));
try {
  const hours = Number(process.argv[2] ?? 48);
  const max = Number(process.argv[3] ?? 10);
  console.log(
    await getTrendingTopics(db, brand, { lookback_hours: hours, max_topics: max })
  );
} finally {
  db.close();
}
