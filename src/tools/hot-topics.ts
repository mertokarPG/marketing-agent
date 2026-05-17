import type Database from "better-sqlite3";
import {
  getTrendsSince,
  getSourceBaselines,
  type TrendRow,
} from "../db/queries.js";

export interface GetHotTopicsInput {
  lookback_hours?: number;
  categories?: string[] | null;
  min_score?: number | null;
  limit?: number;
}

interface RankedTrend extends TrendRow {
  velocity: number; // score / source_p90 (null when no score)
  isBurning: boolean; // velocity > 1 → above the source's 90th percentile
}

function rank(trends: TrendRow[], baselines: Map<string, { p90: number }>): RankedTrend[] {
  return trends
    .map((t) => {
      const base = baselines.get(t.source_id);
      // If we don't have a baseline yet (fewer than ~30 data points in the last
      // 30 days), fall back to raw score. Everything gets ranked fairly once
      // the scraper has been running for a week or two.
      const velocity =
        t.score != null && base && base.p90 > 0
          ? t.score / base.p90
          : t.score != null
            ? t.score / 100 // rough prior until baseline is built
            : 0;
      return { ...t, velocity, isBurning: velocity >= 1 };
    })
    .sort((a, b) => b.velocity - a.velocity || (b.score ?? 0) - (a.score ?? 0));
}

function formatDigest(ranked: RankedTrend[], limit: number): string {
  if (ranked.length === 0) {
    return "No trend data available. The scraper may not have been run yet — try `npx tsx scripts/scrape-hot-topics.ts`.";
  }

  const burning = ranked.filter((t) => t.isBurning).slice(0, limit);
  const recent = ranked.filter((t) => !t.isBurning).slice(0, Math.max(0, limit - burning.length));

  const sections: string[] = [];

  if (burning.length > 0) {
    sections.push("🔥 BURNING (above their source's 90th-percentile):");
    for (const t of burning) {
      sections.push(
        `  • [${t.category}] ${t.title}\n    ${t.url}\n    source=${t.source_id} score=${t.score ?? "—"} velocity=${t.velocity.toFixed(2)}x${
          t.summary ? `\n    ${t.summary.slice(0, 200)}` : ""
        }`
      );
    }
    sections.push("");
  }

  if (recent.length > 0) {
    sections.push("📰 RECENT (from curated feeds, no velocity signal):");
    for (const t of recent) {
      sections.push(
        `  • [${t.category}] ${t.title}\n    ${t.url}\n    source=${t.source_id}${
          t.summary ? `\n    ${t.summary.slice(0, 200)}` : ""
        }`
      );
    }
  }

  return sections.join("\n");
}

export function getHotTopics(
  db: Database.Database,
  input: GetHotTopicsInput = {}
): string {
  const {
    lookback_hours = 48,
    categories = null,
    min_score = null,
    limit = 20,
  } = input;

  const trends = getTrendsSince(db, {
    lookbackHours: lookback_hours,
    categories: categories ?? undefined,
    minScore: min_score ?? undefined,
  });
  const baselines = getSourceBaselines(db);
  const ranked = rank(trends, baselines);

  const header =
    `Hot topics — lookback ${lookback_hours}h, ${ranked.length} items (showing up to ${limit})` +
    (categories ? `, categories=${categories.join(",")}` : "") +
    (min_score != null ? `, min_score=${min_score}` : "") +
    "\n";

  return header + "\n" + formatDigest(ranked, limit);
}
