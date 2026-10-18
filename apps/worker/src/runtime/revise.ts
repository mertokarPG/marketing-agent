import fs from "node:fs/promises";
import path from "node:path";
import {
  BUCKETS, getRevision, markRevision, restoreAfterFailedRevision,
  type BrandConfig, type Db, type MediaItem, type StorageClient,
} from "@carepost/core";

/** What the revise brief tells the agent about the post it is reworking. */
export interface ReviseBriefContext {
  feedback: string; caption: string; hashtags: string[];
  /** The post's current slides, in order, as local files the agent can pass straight to revise_post. */
  slides: string[];
  plannedAt: Date;
}

/**
 * Marks the revision running and downloads the post's current slides into the brand's temp dir, so the agent can
 * keep, reorder or drop them. A revision that already finished is reported as such (nothing left to do).
 */
export async function prepareRevision(
  db: Db, storage: StorageClient, brand: BrandConfig, revisionId: string
): Promise<{ status: "done" | "failed" } | { status: "ready"; context: ReviseBriefContext }> {
  const revision = await getRevision(db, revisionId);
  if (!revision) throw new Error(`revision not found: ${revisionId}`);
  if (revision.status === "done" || revision.status === "failed") return { status: revision.status };
  if (revision.brand_id !== brand.dbId) throw new Error(`revision ${revisionId} belongs to another brand`);
  const [post] = await db.query<{ status: string; caption: string; hashtags: string[]; media: MediaItem[]; planned_at: Date }>(
    "select status, caption, hashtags, media, planned_at from posts where id = $1", [revision.post_id]);
  if (!post) throw new Error(`post not found: ${revision.post_id}`);
  if (post.status !== "reworking") throw new Error(`post ${revision.post_id} is ${post.status}, not reworking`);
  await markRevision(db, revisionId, "running");

  const dir = path.join(brand.brandDir, "current-slides");
  await fs.mkdir(dir, { recursive: true });
  const slides: string[] = [];
  for (const [i, m] of post.media.entries()) {
    const ext = path.extname(m.storage_path).replace(/[^.a-z0-9]/gi, "") || ".png";
    const local = path.join(dir, `${i + 1}${ext}`);
    await fs.writeFile(local, await storage.download(m.bucket ?? BUCKETS.media, m.storage_path));
    slides.push(local);
  }
  return {
    status: "ready",
    context: { feedback: revision.feedback, caption: post.caption, hashtags: post.hashtags, slides, plannedAt: new Date(post.planned_at) },
  };
}

/** Throws unless the agent's revise_post call landed. */
export async function assertRevised(db: Db, revisionId: string): Promise<void> {
  if ((await getRevision(db, revisionId))?.status !== "done") throw new Error("agent did not revise the post");
}

/** A revise run failed for good: the post goes back to its snapshot and prior status, the revision is failed. */
export async function failRevision(db: Db, revisionId: string, error: string): Promise<void> {
  try {
    await restoreAfterFailedRevision(db, revisionId);
    await markRevision(db, revisionId, "failed", error);
  } catch (e) {
    console.warn(`[revision ${revisionId}] restore after failure failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}
