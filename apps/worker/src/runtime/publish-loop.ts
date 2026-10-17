import { BUCKETS, claimDuePosts, expirePendingPosts, markFailed, markPublished, type Db, type StorageClient } from "@carepost/core";
import type { Publisher } from "../publishers/types.js";

export const SIGNED_URL_TTL_SEC = 3600;

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function publishTick(deps: {
  db: Db; storage: StorageClient; publishers: Record<"postiz", Publisher>; notify: (s: string, b: string) => Promise<unknown>;
}): Promise<{ expired: number; published: number; failed: number }> {
  // Expire first: an overdue draft must be terminal before anything is claimed.
  const expired = await expirePendingPosts(deps.db);
  let published = 0;
  let failed = 0;
  for (const post of await claimDuePosts(deps.db, 5)) {
    try {
      // Sign at publish time so the URLs are valid while the platform fetches them; never stored.
      const mediaUrls = await Promise.all(post.media.map((m) => deps.storage.signedUrl(BUCKETS.media, m.storage_path, SIGNED_URL_TTL_SEC)));
      const { externalId } = await deps.publishers[post.publisher].publish({
        id: post.id, brandId: post.brand_id, caption: post.caption, hashtags: post.hashtags, mediaUrls,
      });
      await markPublished(deps.db, post.id, externalId);
      published++;
    } catch (e) {
      const error = msg(e);
      await markFailed(deps.db, post.id, error);
      failed++;
      try {
        await deps.notify(`Publish failed for post ${post.id}`, `Brand ${post.brand_id}, planned ${post.planned_at.toISOString()}:\n${error}`);
      } catch (ne) {
        console.warn(`[post ${post.id}] failure notification failed: ${msg(ne)}`);
      }
    }
  }
  return { expired, published, failed };
}
