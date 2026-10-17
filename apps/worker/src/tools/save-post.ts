import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  BUCKETS, countRunPosts, formatLocal, getBrandNotifyEmails, hasCorePostOnLocalDate, insertPost, localParts,
  type BrandConfig, type Db, type MediaItem,
} from "@carepost/core";
import type { ToolContext } from "../runtime/types.js";

export interface SavePostInput {
  caption: string; hashtags: string[]; images: string[]; promptIds: string[];
  plannedAt: string; kind: "core" | "timely"; rationale: string;
}

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

async function readImage(src: string): Promise<{ bytes: Buffer; ext: string }> {
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`fetch ${src}: HTTP ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    const ext = Object.keys(TYPES).find((k) => TYPES[k] === type.split(";")[0]) ?? "png";
    return { bytes: Buffer.from(await res.arrayBuffer()), ext: ext === "jpeg" ? "jpg" : ext };
  }
  const raw = path.extname(src).slice(1).toLowerCase();
  const ext = raw in TYPES ? (raw === "jpeg" ? "jpg" : raw) : "png";
  return { bytes: await fs.readFile(src), ext };
}

// The tool runner executes a message's tool calls in parallel, so the duplicate
// guards (check, then insert) must not interleave for the same brand.
const brandLocks = new Map<string, Promise<unknown>>();
function withBrandLock<T>(brandId: string, fn: () => Promise<T>): Promise<T> {
  const prev = brandLocks.get(brandId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  const tail = next.catch(() => undefined);
  brandLocks.set(brandId, tail);
  void tail.then(() => { if (brandLocks.get(brandId) === tail) brandLocks.delete(brandId); });
  return next;
}

export function savePost(db: Db, brand: BrandConfig, ctx: ToolContext, input: SavePostInput): Promise<string> {
  return withBrandLock(brand.dbId, () => savePostLocked(db, brand, ctx, input));
}

async function savePostLocked(db: Db, brand: BrandConfig, ctx: ToolContext, input: SavePostInput): Promise<string> {
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

  const id = randomUUID();
  let media: MediaItem[];
  try {
    media = [];
    for (const [n, src] of input.images.entries()) {
      const { bytes, ext } = await readImage(src);
      const storage_path = `${brand.dbId}/${id}/${n}.${ext}`;
      await ctx.storage.upload(BUCKETS.media, storage_path, bytes, TYPES[ext]);
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
  if (input.kind === "timely" && brand.approvalMode === "review") {
    const to = await getBrandNotifyEmails(db, brand.dbId);
    if (to.length > 0) {
      await ctx.notify(`1 timely post needs your OK by ${when}`,
        `${brand.name}: a timely post is waiting for approval before ${when} (${brand.timezone}).\n\n${input.caption}`, to);
    }
  }
  return `Saved ${input.kind} post ${id} for ${when} (${brand.approvalMode === "autopilot" ? "approved" : "pending approval"}).`;
}
