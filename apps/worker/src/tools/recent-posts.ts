import { getRecentPosts, type Db } from "@carepost/core";

export async function getRecentPostsTool(db: Db, brandId: string, limit: number): Promise<string> {
  const posts = await getRecentPosts(db, brandId, limit);
  if (posts.length === 0) return `No recent posts found for this brand.`;
  const formatted = posts
    .map((p) =>
      `[${(p.published_at ?? p.planned_at).toISOString()}] ${p.kind} · ${p.status}\nCaption: ${p.caption}\nMedia: ${p.media.length} image(s)\nHashtags: ${p.hashtags.join(", ")}`)
    .join("\n\n");
  return `Recent ${posts.length} posts:\n\n${formatted}`;
}
