import Database from "better-sqlite3";

interface PostInsert {
  brand_id: string;
  caption: string;
  hashtags: string[];
  image_url?: string;
  content_theme?: string;
  posted_at?: string;
  external_post_id?: string;
  source_images?: string[];
}

interface PostRow {
  id: number;
  brand_id: string;
  caption: string;
  hashtags: string[];
  image_url: string | null;
  posted_at: string | null;
  platform: string;
  external_post_id: string | null;
  content_theme: string | null;
  created_at: string;
}

interface AnalyticsInsert {
  post_id: number;
  brand_id: string;
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  impressions: number;
  views: number;
  saves: number;
  profile_visits: number;
  link_clicks: number;
}

interface PerformanceRow {
  post_id: number;
  external_post_id: string | null;
  caption: string;
  content_theme: string | null;
  posted_at: string | null;
  is_outlier: number;
  notes: string | null;
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  impressions: number;
  views: number;
  saves: number;
  profile_visits: number;
  link_clicks: number;
  measured_at: string;
}

interface CompetitorSnapshotInsert {
  brand_id: string;
  competitor_name: string;
  content_summary: string;
  engagement_notes: string;
}

interface ContentCalendarInsert {
  brand_id: string;
  planned_date: string;
  theme: string;
  caption_draft: string;
  hashtags: string[];
  reasoning: string;
}

export function insertPost(db: Database.Database, post: PostInsert): number {
  const stmt = db.prepare(`
    INSERT INTO posts (brand_id, caption, hashtags, image_url, content_theme, posted_at, external_post_id, source_images)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    post.brand_id,
    post.caption,
    JSON.stringify(post.hashtags),
    post.image_url ?? null,
    post.content_theme ?? null,
    post.posted_at ?? null,
    post.external_post_id ?? null,
    JSON.stringify(post.source_images ?? [])
  );
  return Number(result.lastInsertRowid);
}

export function getUsedPromptIds(
  db: Database.Database,
  brandId: string
): Set<string> {
  const rows = db
    .prepare(`SELECT source_images FROM posts WHERE brand_id = ?`)
    .all(brandId) as Array<{ source_images: string }>;
  const used = new Set<string>();
  for (const row of rows) {
    try {
      const ids = JSON.parse(row.source_images) as string[];
      for (const id of ids) used.add(id);
    } catch {
      // skip malformed rows
    }
  }
  return used;
}

export function getRecentPosts(
  db: Database.Database,
  brandId: string,
  limit: number
): PostRow[] {
  const rows = db
    .prepare(
      "SELECT * FROM posts WHERE brand_id = ? ORDER BY created_at DESC, id DESC LIMIT ?"
    )
    .all(brandId, limit) as Array<PostRow & { hashtags: string }>;

  return rows.map((r) => ({
    ...r,
    hashtags: JSON.parse(r.hashtags as string),
  }));
}

export function insertAnalytics(
  db: Database.Database,
  analytics: AnalyticsInsert
): number {
  const stmt = db.prepare(`
    INSERT INTO analytics (post_id, brand_id, likes, comments, shares, reach, impressions, views, saves, profile_visits, link_clicks)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    analytics.post_id,
    analytics.brand_id,
    analytics.likes,
    analytics.comments,
    analytics.shares,
    analytics.reach,
    analytics.impressions,
    analytics.views,
    analytics.saves,
    analytics.profile_visits,
    analytics.link_clicks
  );
  return Number(result.lastInsertRowid);
}

export function getPostsNeedingExternalId(
  db: Database.Database,
  brandId: string
): Array<{ id: number; caption: string; posted_at: string | null }> {
  return db
    .prepare(
      `SELECT id, caption, posted_at FROM posts
       WHERE brand_id = ? AND (external_post_id IS NULL OR external_post_id = '')
       ORDER BY id DESC`
    )
    .all(brandId) as Array<{ id: number; caption: string; posted_at: string | null }>;
}

export function getPostsWithExternalId(
  db: Database.Database,
  brandId: string
): Array<{ id: number; external_post_id: string; posted_at: string | null }> {
  return db
    .prepare(
      `SELECT id, external_post_id, posted_at FROM posts
       WHERE brand_id = ? AND external_post_id IS NOT NULL AND external_post_id != ''
       ORDER BY id DESC`
    )
    .all(brandId) as Array<{
    id: number;
    external_post_id: string;
    posted_at: string | null;
  }>;
}

export function setExternalPostId(
  db: Database.Database,
  postId: number,
  externalPostId: string
): void {
  db.prepare(`UPDATE posts SET external_post_id = ? WHERE id = ?`).run(
    externalPostId,
    postId
  );
}

// Returns the LATEST analytics snapshot per post (one row per post), newest posts
// first. Avoids returning multiple rows for the same post when ingestion has run
// several times.
// Returns the LATEST analytics snapshot per post (one row per post), newest posts
// first. Avoids returning multiple rows for the same post when ingestion has run
// several times.
export function getPostPerformance(
  db: Database.Database,
  brandId: string,
  limit: number
): PerformanceRow[] {
  return db
    .prepare(
      `SELECT p.id AS post_id, p.external_post_id, p.caption, p.content_theme, p.posted_at,
              p.is_outlier, p.notes,
              a.likes, a.comments, a.shares, a.reach, a.impressions,
              a.views, a.saves, a.profile_visits, a.link_clicks, a.measured_at
       FROM posts p
       JOIN analytics a ON a.post_id = p.id
       JOIN (
         SELECT post_id, MAX(measured_at) AS latest
         FROM analytics
         GROUP BY post_id
       ) latest ON latest.post_id = a.post_id AND latest.latest = a.measured_at
       WHERE p.brand_id = ?
       ORDER BY p.posted_at DESC, p.id DESC
       LIMIT ?`
    )
    .all(brandId, limit) as PerformanceRow[];
}

export function setPostOutlier(
  db: Database.Database,
  postId: number,
  isOutlier: boolean,
  notes: string | null
): void {
  db.prepare(`UPDATE posts SET is_outlier = ?, notes = ? WHERE id = ?`).run(
    isOutlier ? 1 : 0,
    notes,
    postId
  );
}

export function insertCompetitorSnapshot(
  db: Database.Database,
  snapshot: CompetitorSnapshotInsert
): number {
  const stmt = db.prepare(`
    INSERT INTO competitor_snapshots (brand_id, competitor_name, content_summary, engagement_notes)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(
    snapshot.brand_id,
    snapshot.competitor_name,
    snapshot.content_summary,
    snapshot.engagement_notes
  );
  return Number(result.lastInsertRowid);
}

export function insertContentCalendarEntry(
  db: Database.Database,
  entry: ContentCalendarInsert
): number {
  const stmt = db.prepare(`
    INSERT INTO content_calendar (brand_id, planned_date, theme, caption_draft, hashtags, status, reasoning)
    VALUES (?, ?, ?, ?, ?, 'planned', ?)
  `);
  const result = stmt.run(
    entry.brand_id,
    entry.planned_date,
    entry.theme,
    entry.caption_draft,
    JSON.stringify(entry.hashtags),
    entry.reasoning
  );
  return Number(result.lastInsertRowid);
}

export function updateContentCalendarStatus(
  db: Database.Database,
  id: number,
  status: string
): void {
  db.prepare("UPDATE content_calendar SET status = ? WHERE id = ?").run(
    status,
    id
  );
}

export interface TrendInsert {
  source_id: string;
  category: string;
  title: string;
  url: string;
  summary?: string | null;
  published_at?: string | null;
  score?: number | null;
}

export interface TrendRow {
  id: number;
  source_id: string;
  category: string;
  title: string;
  url: string;
  summary: string | null;
  published_at: string | null;
  score: number | null;
  fetched_at: string;
}

// Upsert on URL — if a story already exists, bump its score (trending items
// grow) and refresh fetched_at so velocity windowing stays fresh.
export function upsertTrend(db: Database.Database, t: TrendInsert): void {
  db.prepare(
    `INSERT INTO trends (source_id, category, title, url, summary, published_at, score)
     VALUES (@source_id, @category, @title, @url, @summary, @published_at, @score)
     ON CONFLICT(url) DO UPDATE SET
       score = COALESCE(excluded.score, trends.score),
       title = excluded.title,
       summary = COALESCE(excluded.summary, trends.summary),
       fetched_at = datetime('now')`
  ).run({
    source_id: t.source_id,
    category: t.category,
    title: t.title,
    url: t.url,
    summary: t.summary ?? null,
    published_at: t.published_at ?? null,
    score: t.score ?? null,
  });
}

export function getTrendsSince(
  db: Database.Database,
  opts: { lookbackHours: number; categories?: string[]; minScore?: number | null }
): TrendRow[] {
  const { lookbackHours, categories, minScore } = opts;
  const params: Record<string, unknown> = { lookback: `-${lookbackHours} hours` };
  // Prefer published_at (real publish time) and fall back to fetched_at only
  // when the source didn't expose it. This keeps a fresh scrape of a long RSS
  // archive from flooding the digest as "recent".
  let sql = `SELECT * FROM trends WHERE COALESCE(published_at, fetched_at) >= datetime('now', @lookback)`;
  if (categories && categories.length > 0) {
    sql += ` AND category IN (${categories.map((_, i) => `@cat${i}`).join(",")})`;
    categories.forEach((c, i) => (params[`cat${i}`] = c));
  }
  if (minScore != null) {
    sql += ` AND (score IS NOT NULL AND score >= @minScore)`;
    params.minScore = minScore;
  }
  sql += ` ORDER BY COALESCE(score, 0) DESC, fetched_at DESC`;
  return db.prepare(sql).all(params) as TrendRow[];
}

// Per-source score baseline (median of last 30 days). Used to normalize scores
// across sources so HN's 500-point threshold doesn't drown out Reddit's 100.
export function getSourceBaselines(
  db: Database.Database
): Map<string, { median: number; p90: number }> {
  const rows = db
    .prepare(
      `SELECT source_id, score FROM trends
       WHERE fetched_at >= datetime('now', '-30 days') AND score IS NOT NULL
       ORDER BY source_id, score`
    )
    .all() as Array<{ source_id: string; score: number }>;
  const bySource = new Map<string, number[]>();
  for (const r of rows) {
    if (!bySource.has(r.source_id)) bySource.set(r.source_id, []);
    bySource.get(r.source_id)!.push(r.score);
  }
  const out = new Map<string, { median: number; p90: number }>();
  for (const [src, scores] of bySource) {
    if (scores.length === 0) continue;
    const median = scores[Math.floor(scores.length / 2)];
    const p90 = scores[Math.floor(scores.length * 0.9)] ?? scores[scores.length - 1];
    out.set(src, { median, p90 });
  }
  return out;
}
