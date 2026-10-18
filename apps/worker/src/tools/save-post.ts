import { randomUUID } from "node:crypto";
import {
  BUCKETS, countRunPosts, formatLocal, getBrandNotifyEmails, hasCorePostOnLocalDate, insertPost, localParts,
  type BrandConfig, type Db, type MediaItem,
} from "@carepost/core";
import type { ToolContext } from "../runtime/types.js";
import { ImageSourceError, loadImageSource, type ImageSourceDeps, type LoadedImage } from "./image-source.js";

export interface SavePostInput {
  caption: string; hashtags: string[]; images: string[]; promptIds: string[];
  plannedAt: string; kind: "core" | "timely"; rationale: string;
}

// The tool runner executes a message's tool calls in parallel, so the duplicate
// guards (check, then insert) must not interleave for the same brand.
const locks = new Map<string, Promise<unknown>>();
/** Runs `fn` after every earlier call holding the same key has settled (in-process only). */
export function withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  const tail = next.catch(() => undefined);
  locks.set(key, tail);
  void tail.then(() => { if (locks.get(key) === tail) locks.delete(key); });
  return next;
}
const withBrandLock = <T>(brandId: string, fn: () => Promise<T>) => withKeyLock(`brand:${brandId}`, fn);

export function savePost(
  db: Db, brand: BrandConfig, ctx: ToolContext, input: SavePostInput, deps?: ImageSourceDeps
): Promise<string> {
  return withBrandLock(brand.dbId, () => savePostLocked(db, brand, ctx, input, deps));
}

async function savePostLocked(
  db: Db, brand: BrandConfig, ctx: ToolContext, input: SavePostInput, deps?: ImageSourceDeps
): Promise<string> {
  const plannedAt = new Date(input.plannedAt);
  if (Number.isNaN(plannedAt.getTime())) return `save_post rejected: plannedAt "${input.plannedAt}" is not an ISO timestamp.`;
  if (plannedAt < ctx.window.start || plannedAt >= ctx.window.end)
    return `save_post rejected: plannedAt ${plannedAt.toISOString()} is outside the allowed window ${ctx.window.start.toISOString()} → ${ctx.window.end.toISOString()}.`;
  if (input.images.length < 1 || input.images.length > 10) return "save_post rejected: provide 1–10 images.";

  if (ctx.kind === "daily_check") {
    if (input.kind !== "timely") return `save_post rejected: posts from a daily check must be "timely".`;
    if (ctx.runId && (await countRunPosts(db, ctx.runId)) >= 1)
      return "save_post rejected: a daily check may save at most one timely post.";
  }
  if (ctx.kind === "weekly_plan" && input.kind !== "core") return `save_post rejected: posts from the weekly plan must be "core".`;
  if (input.kind === "core") {
    const ymd = localParts(plannedAt, brand.timezone).ymd;
    if (await hasCorePostOnLocalDate(db, brand.dbId, brand.timezone, ymd))
      return `save_post rejected: ${ymd} already has a core post. Check get_planned_posts.`;
  }

  // Load and validate every image before uploading anything (bounded by the fetch timeout).
  const images: LoadedImage[] = [];
  try {
    for (const src of input.images) images.push(await loadImageSource(src, { brandDir: brand.brandDir, deps }));
  } catch (err) {
    if (err instanceof ImageSourceError) return `save_post rejected: ${err.message}.`;
    return `save_post failed: ${err instanceof Error ? err.message : String(err)}. Nothing was saved; you may retry.`;
  }

  const id = randomUUID();
  const media: MediaItem[] = [];
  try {
    for (const [n, img] of images.entries()) {
      const storage_path = `${brand.dbId}/${id}/${n}.${img.ext}`;
      await ctx.storage.upload(BUCKETS.media, storage_path, img.bytes, img.contentType);
      media.push({ storage_path });
    }
    await insertPost(db, {
      id, brand_id: brand.dbId, run_id: ctx.runId, kind: input.kind,
      status: brand.approvalMode === "autopilot" ? "approved" : "pending_approval",
      planned_at: plannedAt, caption: input.caption, hashtags: input.hashtags, media,
      prompt_ids: input.promptIds, rationale: input.rationale,
    });
  } catch (err) {
    return `save_post failed: ${err instanceof Error ? err.message : String(err)}. Nothing was saved; you may retry.`;
  }

  const when = formatLocal(plannedAt, brand.timezone);
  const saved = `Saved ${input.kind} post ${id} for ${when} (${brand.approvalMode === "autopilot" ? "approved" : "pending approval"})`;
  if (input.kind === "timely" && brand.approvalMode === "review") {
    // The row is already committed; a notification failure must not read as a failed save.
    try {
      const to = await getBrandNotifyEmails(db, brand.dbId);
      if (to.length > 0) {
        await ctx.notify(`1 timely post needs your OK by ${when}`,
          `${brand.name}: a timely post is waiting for approval before ${when} (${brand.timezone}).\n\n${input.caption}`, to);
      }
    } catch (err) {
      return `${saved}; notification failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  return `${saved}.`;
}
