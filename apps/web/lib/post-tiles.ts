import type { SupabaseClient } from "@supabase/supabase-js";
import { isRedone, isRedoFailed, reworkingText, reworkMinutes, type Revision } from "./redo";

type Media = { storage_path: string; bucket?: string };

/** One signed-URL call per bucket for the first image of every post; returns thumbnails by post id. */
export async function signThumbs(supabase: SupabaseClient, posts: { id: string; media: Media[] | null }[], tag: string): Promise<Record<string, string | null>> {
  const wanted = new Map<string, { id: string; path: string }[]>();
  for (const p of posts) {
    const m = p.media?.[0];
    if (!m?.storage_path) continue;
    const bucket = m.bucket === "brand-assets" ? "brand-assets" : "post-media";
    wanted.set(bucket, [...(wanted.get(bucket) ?? []), { id: p.id, path: m.storage_path }]);
  }
  const thumbs: Record<string, string | null> = {};
  await Promise.all([...wanted].map(async ([bucket, items]) => {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls([...new Set(items.map((i) => i.path))], 3600);
    if (error) console.warn(`[${tag}] signed urls failed for ${bucket}: ${error.message}`);
    const byPath = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
    for (const i of items) thumbs[i.id] = byPath.get(i.path) ?? null;
  }));
  return thumbs;
}

/** Veil text for posts being reworked, and the posts whose redo came back (or failed) untouched. */
export async function loadRedoState(
  supabase: SupabaseClient,
  brandId: string,
  posts: { id: string; status: string; last_changed_at: string | null }[],
  tag: string,
): Promise<{ reworks: Record<string, string>; redone: Record<string, boolean>; redoFailed: Record<string, boolean> }> {
  const reworks: Record<string, string> = {};
  const redone: Record<string, boolean> = {};
  const redoFailed: Record<string, boolean> = {};
  const ids = posts.filter((p) => p.status === "reworking" || p.status === "pending_approval").map((p) => p.id);
  if (!ids.length) return { reworks, redone, redoFailed };
  const hasReworking = posts.some((p) => p.status === "reworking");
  const [revQ, genQ] = await Promise.all([
    supabase.from("post_revisions").select("post_id, status, feedback, created_at, finished_at").in("post_id", ids).order("created_at", { ascending: false }),
    hasReworking
      ? supabase.from("brands").select("image_generation").eq("id", brandId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (revQ.error) console.warn(`[${tag}] redo query failed: ${revQ.error.message}`);
  const byPost = new Map<string, Revision[]>();
  for (const r of (revQ.data ?? []) as (Revision & { post_id: string })[]) byPost.set(r.post_id, [...(byPost.get(r.post_id) ?? []), r]);
  const minutes = reworkMinutes(genQ.data?.image_generation);
  for (const p of posts) {
    const revs = byPost.get(p.id) ?? [];
    if (p.status === "reworking") reworks[p.id] = reworkingText(revs[0]?.feedback ?? null, minutes, 40);
    else if (isRedone(p, revs)) redone[p.id] = true;
    else if (isRedoFailed(p, revs)) redoFailed[p.id] = true;
  }
  return { reworks, redone, redoFailed };
}

/** Splits ids into chunks of `size` (the last one shorter). */
export function chunkIds(ids: string[], size = 10): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/**
 * Metric snapshots for these posts, newest first per chunk. PostgREST caps a response at 1000 rows and a post has
 * many snapshots, so ask 10 posts at a time (assumes under ~100 snapshots per post; a daily measurement stays well
 * below that). Throws on a query error.
 */
export async function loadPostMetrics<T>(supabase: SupabaseClient, brandId: string, postIds: string[], cols: string): Promise<T[]> {
  const qs = await Promise.all(chunkIds(postIds).map((c) =>
    supabase.from("post_metrics").select(cols).eq("brand_id", brandId).in("post_id", c).order("measured_at", { ascending: false }),
  ));
  for (const q of qs) if (q.error) throw new Error(`metrics query failed: ${q.error.message}`);
  return qs.flatMap((q) => (q.data ?? []) as T[]);
}
