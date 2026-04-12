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

  return db;
}
