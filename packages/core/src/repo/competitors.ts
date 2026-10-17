import type { Db } from "../db.js";
export async function insertCompetitorSnapshot(
  db: Db, s: { brand_id: string; competitor_name: string; content_summary: string; engagement_notes: string }
): Promise<void> {
  await db.query(
    "insert into competitor_snapshots (brand_id, competitor_name, content_summary, engagement_notes) values ($1,$2,$3,$4)",
    [s.brand_id, s.competitor_name, s.content_summary, s.engagement_notes]);
}
