import Database from "better-sqlite3";
import { getPostPerformance } from "../db/queries.js";

// Rolling-window size for the baseline stats. 20 posts covers ~3 weeks for a
// daily-poster without being so large that a multi-month trend dominates.
const BASELINE_WINDOW = 20;
// Any post > this multiple of the median on likes OR views gets an auto
// "stats-flagged" note. The agent is told to discount these when looking for
// repeatable patterns.
const OUTLIER_MULTIPLIER = 5;

type Metric = "likes" | "views" | "reach";

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// "p82" — rounded percentile of `value` within `sorted` (ascending).
function percentile(sorted: number[], value: number): number {
  if (sorted.length === 0) return 0;
  const below = sorted.filter((v) => v <= value).length;
  return Math.round((below / sorted.length) * 100);
}

function multiple(value: number, base: number): string {
  if (base <= 0) return value > 0 ? "—" : "0×";
  return `${(value / base).toFixed(1)}×`;
}

export function getPostPerformanceTool(
  db: Database.Database,
  brandId: string,
  limit: number
): string {
  // Pull a larger pool to compute the baseline even if the caller asked for a few.
  const pool = getPostPerformance(db, brandId, Math.max(limit, BASELINE_WINDOW));
  if (pool.length === 0) {
    return `No performance data found for brand "${brandId}".`;
  }

  // Baseline excludes user-flagged outliers so statistics aren't themselves skewed
  // by the row we're trying to protect against.
  const baselinePool = pool.filter((p) => !p.is_outlier);
  const stats: Record<Metric, { median: number; sorted: number[] }> = {
    likes: { median: 0, sorted: [] },
    views: { median: 0, sorted: [] },
    reach: { median: 0, sorted: [] },
  };
  for (const m of Object.keys(stats) as Metric[]) {
    const values = baselinePool.map((p) => p[m]).filter((v) => v >= 0);
    stats[m].sorted = [...values].sort((a, b) => a - b);
    stats[m].median = median(values);
  }

  const baselineNote =
    baselinePool.length >= 5
      ? `Baseline (last ${baselinePool.length} non-outlier posts): median ${stats.likes.median} likes, ${stats.views.median} views, ${stats.reach.median} reach.`
      : `Baseline: fewer than 5 non-outlier posts yet — distribution stats below are indicative only.`;

  const rows = pool.slice(0, limit).map((p) => {
    const likesBits = `${p.likes} likes (${multiple(p.likes, stats.likes.median)}, p${percentile(stats.likes.sorted, p.likes)})`;
    const viewsBits = `${p.views} views (${multiple(p.views, stats.views.median)}, p${percentile(stats.views.sorted, p.views)})`;
    const reachBits = `${p.reach} reach (${multiple(p.reach, stats.reach.median)}, p${percentile(stats.reach.sorted, p.reach)})`;

    const flags: string[] = [];
    if (p.is_outlier) {
      flags.push(`USER-FLAGGED OUTLIER${p.notes ? `: ${p.notes}` : ""}`);
    } else {
      const ratios = {
        likes: stats.likes.median > 0 ? p.likes / stats.likes.median : 0,
        views: stats.views.median > 0 ? p.views / stats.views.median : 0,
        reach: stats.reach.median > 0 ? p.reach / stats.reach.median : 0,
      };
      const max = Math.max(ratios.likes, ratios.views, ratios.reach);
      if (max >= OUTLIER_MULTIPLIER) {
        flags.push(
          `STATS-FLAGGED (${max.toFixed(1)}× median) — possible external boost; do not treat as representative`
        );
      }
    }

    const captionPreview = p.caption.slice(0, 120).replace(/\s+/g, " ");
    const flagsLine = flags.length > 0 ? `\n⚠ ${flags.join(" | ")}` : "";
    return `[${p.posted_at ?? "unposted"}] Theme: ${p.content_theme ?? "none"}${flagsLine}\nCaption: ${captionPreview}${p.caption.length > 120 ? "…" : ""}\nMetrics (as of ${p.measured_at}): ${likesBits}, ${p.comments} comments, ${p.shares} shares, ${p.saves} saves, ${viewsBits}, ${reachBits}`;
  });

  return (
    `Performance data for ${brandId} (${rows.length} posts shown, baseline over ${baselinePool.length}):\n` +
    `${baselineNote}\n` +
    `Multipliers are vs the baseline median. "pN" = percentile within the baseline pool.\n` +
    `Any "STATS-FLAGGED" or "USER-FLAGGED OUTLIER" row should NOT be used to infer repeatable patterns.\n\n` +
    rows.join("\n\n")
  );
}
