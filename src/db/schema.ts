import Database from "better-sqlite3";

export function createDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand_id TEXT NOT NULL,
      caption TEXT NOT NULL,
      hashtags TEXT NOT NULL DEFAULT '[]',
      image_url TEXT,
      posted_at TEXT,
      platform TEXT NOT NULL DEFAULT 'instagram',
      external_post_id TEXT,
      content_theme TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL REFERENCES posts(id),
      brand_id TEXT NOT NULL,
      likes INTEGER DEFAULT 0,
      comments INTEGER DEFAULT 0,
      shares INTEGER DEFAULT 0,
      reach INTEGER DEFAULT 0,
      impressions INTEGER DEFAULT 0,
      views INTEGER DEFAULT 0,
      saves INTEGER DEFAULT 0,
      profile_visits INTEGER DEFAULT 0,
      link_clicks INTEGER DEFAULT 0,
      measured_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS competitor_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand_id TEXT NOT NULL,
      competitor_name TEXT NOT NULL,
      content_summary TEXT,
      engagement_notes TEXT,
      scraped_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS content_calendar (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand_id TEXT NOT NULL,
      planned_date TEXT NOT NULL,
      theme TEXT,
      caption_draft TEXT,
      hashtags TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'planned',
      reasoning TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  migratePostsSourceImages(db);
  migrateAnalyticsViewsSaves(db);
  migratePostsOutlierAnnotations(db);
  backfillSourceImagesFromCaptions(db);

  return db;
}

// Migration: add is_outlier + notes columns so the user can annotate posts
// that had an external boost (friend reposted, paid ad, algo quirk) and the
// agent knows to discount them when looking for patterns.
function migratePostsOutlierAnnotations(db: Database.Database): void {
  const cols = db.prepare(`PRAGMA table_info(posts)`).all() as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));
  const run = (sql: string) => db.exec(sql);
  if (!names.has("is_outlier")) {
    run(`ALTER TABLE posts ADD COLUMN is_outlier INTEGER NOT NULL DEFAULT 0`);
  }
  if (!names.has("notes")) {
    run(`ALTER TABLE posts ADD COLUMN notes TEXT`);
  }
}

// Migration: add views + saves columns. Postiz's IG analytics returns both;
// the original schema didn't have slots for them. Uses better-sqlite3's SQL
// runner (not a shell call).
function migrateAnalyticsViewsSaves(db: Database.Database): void {
  const cols = db.prepare(`PRAGMA table_info(analytics)`).all() as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));
  const run = (sql: string) => db.exec(sql);
  if (!names.has("views")) run(`ALTER TABLE analytics ADD COLUMN views INTEGER DEFAULT 0`);
  if (!names.has("saves")) run(`ALTER TABLE analytics ADD COLUMN saves INTEGER DEFAULT 0`);
}

// Migration: add source_images column if missing. Stores JSON array of prompt IDs
// used in the post (canonical dedup identifier). Carousels may have multiple.
function migratePostsSourceImages(db: Database.Database): void {
  const cols = db.prepare(`PRAGMA table_info(posts)`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "source_images")) {
    db.exec(`ALTER TABLE posts ADD COLUMN source_images TEXT NOT NULL DEFAULT '[]'`);
  }
}

// One-time backfill: scan captions of posts with empty source_images and extract
// "prompt #xxx" references. Single-image posts always mention the prompt ID; carousel
// slides beyond slide 1 can't be recovered from captions and are accepted as lost.
function backfillSourceImagesFromCaptions(db: Database.Database): void {
  const rows = db
    .prepare(`SELECT id, caption FROM posts WHERE source_images = '[]'`)
    .all() as Array<{ id: number; caption: string }>;
  const update = db.prepare(`UPDATE posts SET source_images = ? WHERE id = ?`);
  for (const row of rows) {
    const ids = Array.from(
      new Set(Array.from(row.caption.matchAll(/prompt #([a-z0-9-]+)/gi)).map((m) => m[1]))
    );
    if (ids.length > 0) update.run(JSON.stringify(ids), row.id);
  }
}
