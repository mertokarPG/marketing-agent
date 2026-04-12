import Database from "better-sqlite3";
import { getPostPerformance } from "../db/queries.js";

export function getPostPerformanceTool(
  db: Database.Database,
  brandId: string,
  limit: number
): string {
  const perf = getPostPerformance(db, brandId, limit);

  if (perf.length === 0) {
    return `No performance data found for brand "${brandId}".`;
  }

  const formatted = perf
    .map(
      (p) =>
        `[${p.posted_at ?? "unposted"}] Theme: ${p.content_theme ?? "none"}\nCaption: ${p.caption}\n${p.likes} likes, ${p.comments} comments, ${p.shares} shares, ${p.reach} reach, ${p.impressions} impressions, ${p.profile_visits} profile visits, ${p.link_clicks} link clicks`
    )
    .join("\n\n");

  return `Performance data for ${brandId} (${perf.length} posts):\n\n${formatted}`;
}
