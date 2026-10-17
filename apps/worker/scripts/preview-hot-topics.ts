import "dotenv/config";
import path from "path";
import { createDatabase } from "../src/db/schema.js";
import { getHotTopics } from "../src/tools/hot-topics.js";

const db = createDatabase(path.resolve("marketing-agent.db"));
try {
  const hours = Number(process.argv[2] ?? 48);
  const cat = process.argv[3];
  const categories = cat && cat !== "all" ? [cat] : null;
  console.log(getHotTopics(db, { lookback_hours: hours, categories, limit: 15 }));
} finally {
  db.close();
}
