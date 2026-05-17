import fs from "fs";
import Parser from "rss-parser";
import FirecrawlApp from "@mendable/firecrawl-js";
import type Database from "better-sqlite3";
import { upsertTrend } from "../db/queries.js";

export interface HotTopicSource {
  id: string;
  name: string;
  category: string;
  type: "rss" | "hackernews" | "reddit" | "firecrawl-search";
  // For type=firecrawl-search, this field is the search query (not a URL).
  url: string;
}

export interface SourcesConfig {
  sources: HotTopicSource[];
}

export interface ScrapeStat {
  source_id: string;
  name: string;
  category: string;
  type: string;
  inserted: number;
  error?: string;
}

export function loadSourcesConfig(configPath: string): SourcesConfig {
  const raw = fs.readFileSync(configPath, "utf-8");
  return JSON.parse(raw) as SourcesConfig;
}

const rssParser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "carephoto-hot-topics/1.0 (+https://carephoto.art)",
  },
});

// ── RSS ─────────────────────────────────────────────────────────────────────
async function fetchRss(source: HotTopicSource, db: Database.Database): Promise<number> {
  const feed = await rssParser.parseURL(source.url);
  let inserted = 0;
  for (const item of feed.items ?? []) {
    if (!item.link || !item.title) continue;
    upsertTrend(db, {
      source_id: source.id,
      category: source.category,
      title: String(item.title).trim(),
      url: String(item.link).trim(),
      summary: (item.contentSnippet ?? item.content ?? item.summary ?? null)
        ?.toString()
        .replace(/<[^>]+>/g, "")
        .trim()
        .slice(0, 500) || null,
      published_at: item.isoDate ?? item.pubDate ?? null,
      score: null,
    });
    inserted++;
  }
  return inserted;
}

// ── Hacker News (Algolia) ──────────────────────────────────────────────────
interface HNHit {
  objectID: string;
  title?: string;
  url?: string;
  story_text?: string;
  points?: number;
  num_comments?: number;
  created_at?: string;
  _tags?: string[];
}

async function fetchHackerNews(
  source: HotTopicSource,
  db: Database.Database
): Promise<number> {
  const res = await fetch(source.url, {
    headers: { "User-Agent": "carephoto-hot-topics/1.0" },
  });
  if (!res.ok) throw new Error(`HN ${source.url} → ${res.status}`);
  const json = (await res.json()) as { hits?: HNHit[] };
  let inserted = 0;
  for (const hit of json.hits ?? []) {
    if (!hit.title) continue;
    // Prefer external URL; fall back to HN discussion page.
    const url = hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`;
    upsertTrend(db, {
      source_id: source.id,
      category: source.category,
      title: hit.title.trim(),
      url,
      summary: hit.story_text
        ? hit.story_text.replace(/<[^>]+>/g, "").trim().slice(0, 500)
        : null,
      published_at: hit.created_at ?? null,
      score: hit.points ?? 0,
    });
    inserted++;
  }
  return inserted;
}

// ── Reddit JSON ─────────────────────────────────────────────────────────────
interface RedditChild {
  kind: string;
  data: {
    id: string;
    title: string;
    permalink: string;
    url?: string;
    selftext?: string;
    ups?: number;
    score?: number;
    created_utc?: number;
    stickied?: boolean;
    over_18?: boolean;
  };
}

async function fetchReddit(
  source: HotTopicSource,
  db: Database.Database
): Promise<number> {
  // Reddit blocks bare fetches; a real-looking UA avoids 429/403.
  const res = await fetch(source.url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; carephoto-hot-topics/1.0; +https://carephoto.art)",
    },
  });
  if (!res.ok) throw new Error(`Reddit ${source.url} → ${res.status}`);
  const json = (await res.json()) as {
    data?: { children?: RedditChild[] };
  };
  let inserted = 0;
  for (const child of json.data?.children ?? []) {
    const d = child.data;
    if (d.stickied || d.over_18) continue;
    const permalink = `https://www.reddit.com${d.permalink}`;
    upsertTrend(db, {
      source_id: source.id,
      category: source.category,
      title: d.title.trim(),
      url: permalink,
      summary: d.selftext
        ? d.selftext.replace(/\s+/g, " ").trim().slice(0, 500)
        : d.url && d.url !== permalink
          ? `Link: ${d.url}`
          : null,
      published_at: d.created_utc
        ? new Date(d.created_utc * 1000).toISOString()
        : null,
      score: d.ups ?? d.score ?? 0,
    });
    inserted++;
  }
  return inserted;
}

// ── Firecrawl search (fallback for sources without RSS) ────────────────────
async function fetchFirecrawlSearch(
  source: HotTopicSource,
  db: Database.Database
): Promise<number> {
  if (!process.env.FIRECRAWL_API_KEY) {
    throw new Error("FIRECRAWL_API_KEY not set — required for firecrawl-search sources");
  }
  const fc = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });
  const result = await fc.search(source.url, { limit: 20 });
  if (!result.success) throw new Error(`Firecrawl search failed: ${source.url}`);
  let inserted = 0;
  for (const hit of (result.data ?? []) as Array<{
    title?: string;
    url?: string;
    description?: string;
  }>) {
    if (!hit.url || !hit.title) continue;
    upsertTrend(db, {
      source_id: source.id,
      category: source.category,
      title: hit.title.trim(),
      url: hit.url.trim(),
      summary: hit.description?.trim().slice(0, 500) ?? null,
      published_at: null, // FC search doesn't expose publish date reliably
      score: null,
    });
    inserted++;
  }
  return inserted;
}

// ── Orchestrator ────────────────────────────────────────────────────────────
export async function scrapeAllSources(
  db: Database.Database,
  configPath: string
): Promise<ScrapeStat[]> {
  const cfg = loadSourcesConfig(configPath);
  const stats: ScrapeStat[] = [];

  // Run sources in parallel within a small concurrency cap so one slow feed
  // doesn't serialize the whole run, but we also don't hammer Reddit/HN.
  const POOL = 4;
  let cursor = 0;
  async function worker() {
    while (cursor < cfg.sources.length) {
      const source = cfg.sources[cursor++];
      const t0 = Date.now();
      try {
        const inserted =
          source.type === "hackernews"
            ? await fetchHackerNews(source, db)
            : source.type === "reddit"
              ? await fetchReddit(source, db)
              : source.type === "firecrawl-search"
                ? await fetchFirecrawlSearch(source, db)
                : await fetchRss(source, db);
        stats.push({
          source_id: source.id,
          name: source.name,
          category: source.category,
          type: source.type,
          inserted,
        });
        console.log(
          `  [${source.id.padEnd(28)}] ${source.type.padEnd(11)} ${String(inserted).padStart(3)} items  (${Date.now() - t0}ms)`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        stats.push({
          source_id: source.id,
          name: source.name,
          category: source.category,
          type: source.type,
          inserted: 0,
          error: msg,
        });
        console.log(
          `  [${source.id.padEnd(28)}] ${source.type.padEnd(11)} FAILED: ${msg}`
        );
      }
    }
  }
  await Promise.all(Array.from({ length: POOL }, () => worker()));

  return stats;
}
