import Database from "better-sqlite3";
import { getRecentPosts } from "../db/queries.js";

export function getRecentPostsTool(
  db: Database.Database,
  brandId: string,
  limit: number
): string {
  const posts = getRecentPosts(db, brandId, limit);

  if (posts.length === 0) {
    return `No recent posts found for brand "${brandId}".`;
  }

  const formatted = posts
    .map(
      (p) =>
        `[${p.created_at}] Theme: ${p.content_theme ?? "none"}\nCaption: ${p.caption}\nHashtags: ${p.hashtags.join(", ")}`
    )
    .join("\n\n");

  return `Recent ${posts.length} posts for ${brandId}:\n\n${formatted}`;
}
