import type { Db } from "../db.js";

export interface InsightRow { id: string; brand_id: string; week_key: string; body: string; created_at: Date }

/** One insight per brand and week: a second write for the same week replaces the first. */
export async function upsertInsight(db: Db, brandId: string, weekKey: string, body: string): Promise<void> {
  await db.query(
    `insert into brand_insights (brand_id, week_key, body) values ($1, $2, $3)
     on conflict (brand_id, week_key) do update set body = excluded.body, created_at = now()`,
    [brandId, weekKey, body]);
}

export async function listInsights(db: Db, brandId: string, limit: number): Promise<InsightRow[]> {
  return db.query<InsightRow>(
    "select * from brand_insights where brand_id = $1 order by week_key desc, created_at desc limit $2",
    [brandId, limit]);
}
