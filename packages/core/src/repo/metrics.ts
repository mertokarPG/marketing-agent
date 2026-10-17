import type { Db } from "../db.js";
import { iso } from "./sql.js";

export interface AnalyticsInsert {
  post_id: string; brand_id: string; likes: number; comments: number; shares: number; reach: number;
  impressions: number; views: number; saves: number; profile_visits: number; link_clicks: number;
}
export interface PerformanceRow extends Omit<AnalyticsInsert, "brand_id"> {
  external_post_id: string | null; caption: string; content_theme: string | null; posted_at: string | null;
  is_outlier: boolean; notes: string | null; measured_at: string;
}

export async function insertAnalytics(db: Db, a: AnalyticsInsert): Promise<void> {
  await db.query(
    `insert into post_metrics (post_id, brand_id, likes, comments, shares, reach, impressions, views, saves, profile_visits, link_clicks)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [a.post_id, a.brand_id, a.likes, a.comments, a.shares, a.reach, a.impressions, a.views, a.saves, a.profile_visits, a.link_clicks]);
}

/** Latest metrics snapshot per post, newest posts first. Field names match the legacy SQLite shape. */
export async function getPostPerformance(db: Db, brandId: string, limit: number): Promise<PerformanceRow[]> {
  return db.query<PerformanceRow>(
    `select distinct on (p.id)
        p.id as post_id, p.external_post_id, p.caption, p.kind as content_theme, ${iso("p.published_at")} as posted_at,
        p.is_outlier, p.notes, m.likes, m.comments, m.shares, m.reach, m.impressions, m.views, m.saves,
        m.profile_visits, m.link_clicks, ${iso("m.measured_at")} as measured_at, p.published_at as _sort
     from posts p join post_metrics m on m.post_id = p.id
     where p.brand_id = $1
     order by p.id, m.measured_at desc`, [brandId]
  ).then((rows) =>
    rows
      .sort((a: any, b: any) => (b._sort?.getTime?.() ?? 0) - (a._sort?.getTime?.() ?? 0))
      .slice(0, limit)
      .map(({ _sort, ...r }: any) => r as PerformanceRow));
}
