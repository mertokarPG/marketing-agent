import { BUCKETS, claimDuePosts, expireMissedApprovedPosts, expirePendingPosts, markFailed, markPublished, type Db, type StorageClient } from "@carepost/core";
import type { Publisher } from "../publishers/types.js";

export const SIGNED_URL_TTL_SEC = 3600;

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function recordFailure(
  deps: { db: Db; notify: (s: string, b: string) => Promise<unknown> },
  post: { id: string }, error: string, subject: string, body: string, externalId?: string,
): Promise<void> {
  try { await markFailed(deps.db, post.id, error, externalId); }
  catch (e) { console.warn(`[post ${post.id}] could not record failure: ${msg(e)}`); }
  try { await deps.notify(subject, body); }
  catch (e) { console.warn(`[post ${post.id}] failure notification failed: ${msg(e)}`); }
}

export async function publishTick(deps: {
  db: Db; storage: StorageClient; publishers: Record<"postiz", Publisher>; notify: (s: string, b: string) => Promise<unknown>;
}): Promise<{ expired: number; published: number; failed: number }> {
  // Expire first: an overdue draft, or an approved post that missed its publish window (>6h late),
  // must be terminal before anything is claimed.
  const expired = (await expirePendingPosts(deps.db)) + (await expireMissedApprovedPosts(deps.db));
  let published = 0;
  let failed = 0;
  for (const post of await claimDuePosts(deps.db, 5)) {
    let externalId: string;
    try {
      // Sign at publish time so the URLs are valid while the platform fetches them; never stored.
      const mediaUrls = await Promise.all(post.media.map((m) => deps.storage.signedUrl(BUCKETS.media, m.storage_path, SIGNED_URL_TTL_SEC)));
      ({ externalId } = await deps.publishers[post.publisher].publish({
        id: post.id, brandId: post.brand_id, caption: post.caption, hashtags: post.hashtags, mediaUrls,
      }));
    } catch (e) {
      failed++;
      await recordFailure(deps, post, msg(e), `Publish failed for post ${post.id}`,
        `Brand ${post.brand_id}, planned ${post.planned_at.toISOString()}:\n${msg(e)}`);
      continue;
    }
    // The post is live now. Never let a bookkeeping failure look like a publish failure.
    try {
      try { await markPublished(deps.db, post.id, externalId); }
      catch { await markPublished(deps.db, post.id, externalId); }
      published++;
    } catch (e) {
      failed++;
      await recordFailure(deps, post, `published as ${externalId} but status update failed: ${msg(e)}`,
        `Post ${post.id} IS LIVE - do NOT repost (status update failed)`,
        `Post ${post.id} (brand ${post.brand_id}) was published as ${externalId} but recording it failed: ${msg(e)}.\nIt IS live. Do not repost it.`,
        externalId);
    }
  }
  return { expired, published, failed };
}
