import Database from "better-sqlite3";
import type { BrandConfig } from "../config/load-brand.js";
import {
  insertAnalytics,
  getPostsWithExternalId,
  getPostsNeedingExternalId,
  setExternalPostId,
} from "../db/queries.js";

interface PostizPost {
  id: string;
  content: string;
  publishDate: string;
  state: string;
  releaseURL: string | null;
  group?: string;
  integration?: { id: string; providerIdentifier?: string };
}

interface AnalyticsMetric {
  label: string;
  percentageChange?: number;
  data: Array<{ total: string | number; date: string }>;
}

async function postizFetch(path: string): Promise<Response> {
  const apiKey = process.env.POSTIZ_API_KEY!;
  const baseUrl =
    process.env.POSTIZ_BASE_URL ?? "https://app.postiz.com/api/public/v1";
  return fetch(`${baseUrl}${path}`, {
    headers: { Authorization: apiKey },
  });
}

// Latest value across the metric's daily points. Returns 0 when the label is absent.
function latestMetric(metrics: AnalyticsMetric[], label: string): number {
  const m = metrics.find((x) => x.label === label);
  if (!m || m.data.length === 0) return 0;
  const sorted = [...m.data].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted[sorted.length - 1];
  const v = typeof last.total === "string" ? parseInt(last.total, 10) : last.total;
  return Number.isFinite(v) ? v : 0;
}

// Try to match DB posts that have no external_post_id against Postiz's post list,
// by caption-prefix + a ±1-day window around posted_at.
async function backfillExternalIds(
  brand: BrandConfig,
  db: Database.Database
): Promise<number> {
  const missing = getPostsNeedingExternalId(db, brand.id);
  if (missing.length === 0) return 0;

  const earliest = missing
    .map((p) => p.posted_at)
    .filter((d): d is string => typeof d === "string" && d.length > 0)
    .sort()[0];
  const start = earliest ? new Date(earliest) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const startDate = new Date(start.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const endDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);

  const res = await postizFetch(`/posts?startDate=${startDate}&endDate=${endDate}`);
  if (!res.ok) {
    console.warn(`[ingest-analytics] posts list failed (${res.status})`);
    return 0;
  }
  const body = (await res.json()) as { posts?: PostizPost[] };
  const postizPosts = body.posts ?? [];

  let matched = 0;
  for (const dbPost of missing) {
    if (!dbPost.posted_at) continue;
    const dbCaptionHead = dbPost.caption.slice(0, 80).trim();
    // Match by caption prefix (our caption is a prefix of Postiz's — Postiz appends hashtags)
    const candidate = postizPosts.find(
      (p) => p.content.includes(dbCaptionHead) && p.publishDate.startsWith(dbPost.posted_at!.slice(0, 10))
    );
    if (candidate) {
      setExternalPostId(db, dbPost.id, candidate.id);
      matched++;
    }
  }
  return matched;
}

export interface IngestResult {
  backfilled: number;
  ingested: number;
  skipped: number;
  errors: number;
}

export async function ingestAnalytics(
  brand: BrandConfig,
  db: Database.Database
): Promise<IngestResult> {
  if (!process.env.POSTIZ_API_KEY) {
    return { backfilled: 0, ingested: 0, skipped: 0, errors: 0 };
  }

  const result: IngestResult = { backfilled: 0, ingested: 0, skipped: 0, errors: 0 };

  try {
    result.backfilled = await backfillExternalIds(brand, db);
  } catch (err) {
    console.warn(`[ingest-analytics] backfill failed: ${err instanceof Error ? err.message : err}`);
  }

  const posts = getPostsWithExternalId(db, brand.id);
  for (const post of posts) {
    try {
      const res = await postizFetch(`/analytics/post/${post.external_post_id}`);
      if (!res.ok) {
        // 404 on very fresh posts is normal (IG hasn't reported metrics yet).
        if (res.status === 404) {
          result.skipped++;
        } else {
          result.errors++;
          console.warn(
            `[ingest-analytics] ${post.external_post_id} → HTTP ${res.status}`
          );
        }
        continue;
      }
      const metrics = (await res.json()) as AnalyticsMetric[];
      if (!Array.isArray(metrics) || metrics.length === 0) {
        result.skipped++;
        continue;
      }

      insertAnalytics(db, {
        post_id: post.id,
        brand_id: brand.id,
        likes: latestMetric(metrics, "Likes"),
        comments: latestMetric(metrics, "Comments"),
        shares: latestMetric(metrics, "Shares"),
        reach: latestMetric(metrics, "Reach"),
        impressions: latestMetric(metrics, "Impressions"),
        views: latestMetric(metrics, "Views"),
        saves: latestMetric(metrics, "Saves"),
        profile_visits: latestMetric(metrics, "Profile Visits"),
        link_clicks: latestMetric(metrics, "Link Clicks"),
      });
      result.ingested++;
    } catch (err) {
      result.errors++;
      console.warn(
        `[ingest-analytics] ${post.external_post_id} failed: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  console.log(
    `[ingest-analytics] backfilled=${result.backfilled} ingested=${result.ingested} skipped=${result.skipped} errors=${result.errors}`
  );
  return result;
}
