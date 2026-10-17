import type { Db } from "../db.js";
import { iso } from "./sql.js";

export interface TrendInsert {
  source_id: string; category: string; title: string; url: string;
  summary?: string | null; published_at?: string | null; score?: number | null;
}
export interface TrendRow {
  id: number; source_id: string; category: string; title: string; url: string;
  summary: string | null; published_at: string | null; score: number | null; fetched_at: string;
}

function toTimestamp(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function upsertTrend(db: Db, brandId: string, t: TrendInsert): Promise<void> {
  await db.query(
    `insert into trends (brand_id, source_id, category, title, url, summary, published_at, score)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (brand_id, url) do update set
       score = coalesce(excluded.score, trends.score), title = excluded.title,
       summary = coalesce(excluded.summary, trends.summary),
       published_at = coalesce(trends.published_at, excluded.published_at), fetched_at = now()`,
    [brandId, t.source_id, t.category, t.title, t.url, t.summary ?? null, toTimestamp(t.published_at), t.score ?? null]);
}

export async function getTrendsSince(
  db: Db, brandId: string, opts: { lookbackHours: number; categories?: string[]; minScore?: number | null }
): Promise<TrendRow[]> {
  return db.query<TrendRow>(
    `select id, source_id, category, title, url, summary, ${iso("published_at")} as published_at, score, ${iso("fetched_at")} as fetched_at
     from trends
     where brand_id = $1 and coalesce(published_at, fetched_at) >= now() - make_interval(hours => $2)
       and ($3::text[] is null or category = any($3::text[]))
       and ($4::int is null or (score is not null and score >= $4))
     order by coalesce(score, 0) desc, fetched_at desc`,
    [brandId, opts.lookbackHours, opts.categories && opts.categories.length ? opts.categories : null, opts.minScore ?? null]);
}

export async function getSourceBaselines(db: Db, brandId: string): Promise<Map<string, { median: number; p90: number }>> {
  const rows = await db.query<{ source_id: string; score: number }>(
    `select source_id, score from trends
     where brand_id = $1 and fetched_at >= now() - interval '30 days' and score is not null
     order by source_id, score`, [brandId]);
  const bySource = new Map<string, number[]>();
  for (const r of rows) {
    if (!bySource.has(r.source_id)) bySource.set(r.source_id, []);
    bySource.get(r.source_id)!.push(r.score);
  }
  const out = new Map<string, { median: number; p90: number }>();
  for (const [src, scores] of bySource) {
    out.set(src, {
      median: scores[Math.floor(scores.length / 2)],
      p90: scores[Math.floor(scores.length * 0.9)] ?? scores[scores.length - 1],
    });
  }
  return out;
}
