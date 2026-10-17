import type Database from "better-sqlite3";
import type { Db } from "@carepost/core";

// SQLite datetime('now') values are UTC "YYYY-MM-DD HH:MM:SS"; posted_at is already ISO.
function toDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

/** One-off import of legacy SQLite history. Every table is independently idempotent, so a crashed run can simply be re-run. */
export async function migrateSqlite(sqlite: Database.Database, db: Db, brandId: string) {
  const counts = { posts: 0, metrics: 0, trends: 0, competitors: 0 };
  const idMap = new Map<number, string>();

  for (const p of sqlite.prepare("select * from posts order by id").all() as any[]) {
    const ref = `sqlite:${p.id}`;
    const at = toDate(p.posted_at) ?? toDate(p.created_at) ?? new Date();
    const notes = [p.image_url, p.notes].filter(Boolean).join(" ") || null;
    const inserted = await db.query<{ id: string }>(
      `insert into posts (brand_id, kind, status, planned_at, published_at, caption, hashtags, media, prompt_ids, rationale,
         external_post_id, is_outlier, notes, import_ref)
       values ($1,'core','published',$2,$2,$3,$4::text[],'[]'::jsonb,$5::text[],'',$6,$7,$8,$9)
       on conflict (brand_id, import_ref) where import_ref is not null do nothing
       returning id`,
      [brandId, at, p.caption, JSON.parse(p.hashtags ?? "[]"), JSON.parse(p.source_images ?? "[]"),
       p.external_post_id ?? null, !!p.is_outlier, notes, ref]);
    if (inserted[0]) { idMap.set(p.id, inserted[0].id); counts.posts++; continue; }
    const [existing] = await db.query<{ id: string }>("select id from posts where brand_id = $1 and import_ref = $2", [brandId, ref]);
    idMap.set(p.id, existing.id);
  }

  for (const a of sqlite.prepare("select * from analytics order by id").all() as any[]) {
    const postId = idMap.get(a.post_id);
    if (!postId) continue;
    const measuredAt = toDate(a.measured_at) ?? new Date();
    const rows = await db.query(
      `insert into post_metrics (post_id, brand_id, likes, comments, shares, reach, impressions, views, saves, profile_visits, link_clicks, measured_at)
       select $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::timestamptz
       where not exists (select 1 from post_metrics where post_id = $1 and measured_at = $12::timestamptz)
       returning id`,
      [postId, brandId, a.likes ?? 0, a.comments ?? 0, a.shares ?? 0, a.reach ?? 0, a.impressions ?? 0, a.views ?? 0,
       a.saves ?? 0, a.profile_visits ?? 0, a.link_clicks ?? 0, measuredAt]);
    counts.metrics += rows.length;
  }

  for (const t of sqlite.prepare("select * from trends order by id").all() as any[]) {
    const rows = await db.query(
      `insert into trends (brand_id, source_id, category, title, url, summary, published_at, score, fetched_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,coalesce($9, now()))
       on conflict (brand_id, url) do nothing returning id`,
      [brandId, t.source_id, t.category, t.title, t.url, t.summary ?? null, toDate(t.published_at), t.score ?? null, toDate(t.fetched_at)]);
    counts.trends += rows.length;
  }

  for (const c of sqlite.prepare("select * from competitor_snapshots order by id").all() as any[]) {
    const scrapedAt = toDate(c.scraped_at) ?? new Date();
    const rows = await db.query(
      `insert into competitor_snapshots (brand_id, competitor_name, content_summary, engagement_notes, scraped_at)
       select $1,$2,$3,$4,$5::timestamptz
       where not exists (select 1 from competitor_snapshots where brand_id = $1 and competitor_name = $2 and scraped_at = $5::timestamptz)
       returning id`,
      [brandId, c.competitor_name, c.content_summary ?? "", c.engagement_notes ?? "", scrapedAt]);
    counts.competitors += rows.length;
  }
  return counts;
}
