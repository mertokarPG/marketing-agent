import {
  BUCKETS, type BrandConfig, type Db, type MediaItem, type RevisionRow,
} from "@carepost/core";
import type { ToolContext } from "../runtime/types.js";
import { ImageSourceError, loadImageSource, type ImageSourceDeps, type LoadedImage } from "./image-source.js";
import { withKeyLock } from "./save-post.js";

export interface RevisePostInput { caption: string; hashtags: string[]; images: string[]; rationale: string }

/** Instagram's caption limit, counted the way it is published: caption + "\n\n" + hashtags joined by spaces. */
const MAX_PUBLISHED_CAPTION = 2200;
const publishedLength = (caption: string, hashtags: string[]) =>
  caption.length + (hashtags.length > 0 ? 2 + hashtags.join(" ").length : 0);

/**
 * Saves the agent's reworked version over the post being revised and hands it back for review. It never goes
 * through save_post: no new post, no window or duplicate-date guards. One successful call per revision.
 */
export function revisePost(
  db: Db, brand: BrandConfig, ctx: ToolContext, revision: RevisionRow, input: RevisePostInput, deps?: ImageSourceDeps
): Promise<string> {
  return withKeyLock(`revision:${revision.id}`, () => revisePostLocked(db, brand, ctx, revision, input, deps));
}

async function revisePostLocked(
  db: Db, brand: BrandConfig, ctx: ToolContext, revision: RevisionRow, input: RevisePostInput, deps?: ImageSourceDeps
): Promise<string> {
  if (revision.brand_id !== brand.dbId) return "revise_post rejected: this revision belongs to another brand.";
  const [current] = await db.query<{ status: string; n: number }>(
    `select r.status, (select count(*)::int from post_revisions o
                       where o.post_id = r.post_id and o.created_at <= r.created_at) as n
     from post_revisions r where r.id = $1`, [revision.id]);
  if (!current) return "revise_post rejected: the revision no longer exists.";
  if (current.status === "done") return "revise_post rejected: this post was already revised in this run. Do not call revise_post again; finish now.";
  if (current.status !== "running") return `revise_post rejected: the revision is ${current.status}, not running.`;
  if (input.images.length < 1 || input.images.length > 10) return "revise_post rejected: provide 1–10 images.";
  if (publishedLength(input.caption, input.hashtags) > MAX_PUBLISHED_CAPTION)
    return `revise_post rejected: caption plus hashtags exceed Instagram's ${MAX_PUBLISHED_CAPTION} characters. Shorten it.`;

  // Load and validate every image before uploading anything (same rules as save_post).
  const images: LoadedImage[] = [];
  try {
    for (const src of input.images) images.push(await loadImageSource(src, { brandDir: brand.brandDir, deps }));
  } catch (err) {
    if (err instanceof ImageSourceError) return `revise_post rejected: ${err.message}.`;
    return `revise_post failed: ${err instanceof Error ? err.message : String(err)}. Nothing was saved; you may retry.`;
  }

  const media: MediaItem[] = [];
  let updated: { needs_new_time: boolean }[];
  try {
    for (const [i, img] of images.entries()) {
      const storage_path = `${brand.dbId}/${revision.post_id}/r${current.n}-${i}.${img.ext}`;
      await ctx.storage.upload(BUCKETS.media, storage_path, img.bytes, img.contentType);
      media.push({ storage_path });
    }
    // One statement: the post is only overwritten while it is still reworking for a running revision, and the
    // revision is only marked done when the post was.
    updated = await db.query<{ needs_new_time: boolean }>(
      `with p as (
         update posts set status = 'pending_approval', caption = $3, hashtags = $4::text[], media = $5::jsonb,
           rationale = $6, last_changed_at = now(), last_changed_by = null,
           needs_new_time = needs_new_time or planned_at <= now() + interval '15 minutes'
         where id = $2 and status = 'reworking'
           and exists (select 1 from post_revisions where id = $1 and status = 'running')
         returning needs_new_time)
       , r as (
         update post_revisions set status = 'done', error = null, finished_at = now()
         where id = $1 and exists (select 1 from p) returning id)
       select p.needs_new_time from p, r`,
      [revision.id, revision.post_id, input.caption, input.hashtags, JSON.stringify(media), input.rationale]);
  } catch (err) {
    return `revise_post failed: ${err instanceof Error ? err.message : String(err)}. Nothing was saved; you may retry.`;
  }
  if (updated.length === 0) return "revise_post rejected: the post is no longer being reworked. Nothing was saved.";
  const late = updated[0].needs_new_time ? " Its planned time is too close or has passed, so the owner will pick a new time." : "";
  return `Revised post ${revision.post_id} (${media.length} slide${media.length === 1 ? "" : "s"}); it is back with the owner for review.${late}`;
}
