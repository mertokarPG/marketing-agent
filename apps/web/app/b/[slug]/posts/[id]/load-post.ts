import { notFound } from "next/navigation";
import { localParts } from "@carepost/core/time";
import { createClient } from "@/lib/supabase/server";
import { postLabel } from "@/lib/labels";
import type { MediaItem } from "@/lib/slides";
import { isRedone, isRedoFailed, redoAvailability, reworkMinutes, versionLabel, type RedoAvailability, type Revision } from "@/lib/redo";
import { loadBrand } from "../../brand-context";
import { waitingPosts } from "../../home-data";
import {
  postActions, stepNav, joinCaption, goesOutLabel, weekdayName, formatChip, lastChangedText, latestMetrics,
  type PostActionsView, type Metrics,
} from "./post-data";

type Media = MediaItem;

export type VersionView = { id: string; label: string; text: string; slides: (string | null)[]; count: number };
export type ProductView = { path: string; url: string | null; label: string | null };

export type PostViewData = {
  slug: string;
  post: { id: string; status: string; planned_at: string; caption: string; hashtags: string[]; rationale: string; needs_new_time: boolean; last_changed_at: string | null };
  slides: (string | null)[];
  /** The stored slides, parallel to `slides` (signed URLs). */
  media: MediaItem[];
  /** Changes when the post's content is replaced from outside the editors (status change, redo, restore). */
  contentKey: string;
  redo: RedoAvailability;
  revisions: Revision[];
  reworkMinutes: 2 | 4;
  versions: VersionView[];
  /** The brand's product photos for "+ Add a product photo"; null when the slides can't be edited. */
  products: ProductView[] | null;
  brand: { name: string; handle: string; logoUrl: string | null; timezone: string };
  actions: PostActionsView;
  label: { text: string; tone: string };
  weekday: string;
  goesOut: string;
  chip: string;
  lastChanged: string | null;
  metrics: Metrics | null;
  nav: { prev: string | null; next: string | null; index: number; total: number } | null;
  time: { ymd: string; hhmm: string; minYmd: string };
};

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export async function loadPost(slug: string, id: string, review: boolean): Promise<PostViewData> {
  if (!isUuid(id)) notFound();
  const brand = await loadBrand(slug);
  const supabase = await createClient();
  const now = new Date();
  const tz = brand.timezone;

  const [postQ, userQ] = await Promise.all([
    supabase.from("posts")
      .select("id, status, planned_at, caption, hashtags, media, rationale, needs_new_time, last_changed_by, last_changed_at")
      .eq("id", id).eq("brand_id", brand.id).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  if (postQ.error) throw new Error(`post query failed: ${postQ.error.message}`);
  const post = postQ.data;
  if (!post) notFound();

  const media = (Array.isArray(post.media) ? post.media : []) as Media[];
  const actions = postActions(post, brand, brand.role, now);
  const [revQ, verQ, genQ, prodQ] = await Promise.all([
    supabase.from("post_revisions").select("status, feedback, created_at, finished_at")
      .eq("post_id", post.id).order("created_at", { ascending: false }).limit(50),
    supabase.from("post_versions").select("id, caption, hashtags, media, reason, feedback, created_at")
      .eq("post_id", post.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("brands").select("image_generation").eq("id", brand.id).maybeSingle(),
    actions.editable
      ? supabase.from("brand_assets").select("storage_path, label").eq("brand_id", brand.id).eq("kind", "product").order("created_at").limit(60)
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (revQ.error) throw new Error(`revisions query failed: ${revQ.error.message}`);
  if (verQ.error) throw new Error(`versions query failed: ${verQ.error.message}`);
  if (genQ.error) throw new Error(`brand query failed: ${genQ.error.message}`);
  if (prodQ.error) throw new Error(`products query failed: ${prodQ.error.message}`);
  const revisions = (revQ.data ?? []) as Revision[];
  const versionRows = (verQ.data ?? []) as { id: string; caption: string; hashtags: string[]; media: unknown; reason: string; feedback: string | null; created_at: string }[];
  const productRows = (prodQ.data ?? null) as { storage_path: string; label: string | null }[] | null;
  const versionMedia = versionRows.map((v) => (Array.isArray(v.media) ? v.media : []) as Media[]);
  const productMedia: Media[] = (productRows ?? []).map((p) => ({ storage_path: p.storage_path, bucket: "brand-assets" }));

  const [signed, metricsQ, waitQ] = await Promise.all([
    signAll(supabase, [media, productMedia, ...versionMedia]),
    post.status === "published"
      ? supabase.from("post_metrics").select("reach, saves, shares, likes, comments, measured_at")
          .eq("post_id", post.id).order("measured_at", { ascending: false }).limit(1)
      : Promise.resolve({ data: [], error: null }),
    review
      ? supabase.from("posts").select("id, status, planned_at, needs_new_time").eq("brand_id", brand.id)
          .eq("status", "pending_approval").or(`planned_at.gt."${now.toISOString()}",needs_new_time.eq.true`)
          .order("needs_new_time", { ascending: false }).order("planned_at").limit(50)
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (metricsQ.error) throw new Error(`metrics query failed: ${metricsQ.error.message}`);
  if (waitQ.error) throw new Error(`waiting query failed: ${waitQ.error.message}`);

  let nav: PostViewData["nav"] = null;
  if (review && waitQ.data) {
    const n = stepNav(waitingPosts(waitQ.data, now).map((w) => w.id), post.id);
    if (n.index >= 0 && n.total > 1) nav = n;
  }

  const [slides, productUrls, ...versionUrls] = signed;
  const local = localParts(new Date(post.planned_at), tz);
  const today = localParts(now, tz).ymd;
  return {
    slug,
    post: {
      id: post.id,
      status: post.status,
      planned_at: post.planned_at,
      caption: post.caption ?? "",
      hashtags: post.hashtags ?? [],
      rationale: post.rationale ?? "",
      needs_new_time: post.needs_new_time,
      last_changed_at: post.last_changed_at,
    },
    slides,
    media,
    contentKey: `${post.status}|${versionRows[0]?.id ?? ""}`,
    redo: redoAvailability(post, brand, brand.role, revisions, now),
    revisions,
    reworkMinutes: reworkMinutes(genQ.data?.image_generation),
    versions: versionRows.map((v, i) => ({
      id: v.id,
      label: versionLabel(v, tz),
      text: joinCaption(v.caption ?? "", v.hashtags ?? []),
      slides: versionUrls[i],
      count: versionMedia[i].length,
    })),
    products: productRows ? productRows.map((p, i) => ({ path: p.storage_path, url: productUrls[i], label: p.label })) : null,
    brand: { name: brand.name, handle: brand.instagram_handle ?? brand.slug, logoUrl: brand.logoUrl, timezone: tz },
    actions,
    label: postLabel(post, brand, now, { redone: isRedone(post, revisions), redoFailed: isRedoFailed(post, revisions) }),
    weekday: weekdayName(post.planned_at, tz),
    goesOut: goesOutLabel(post.planned_at, tz),
    chip: formatChip(media.length, post.status),
    lastChanged: lastChangedText({ by: post.last_changed_by, at: post.last_changed_at }, userQ.data.user?.id ?? null, tz),
    metrics: latestMetrics((metricsQ.data ?? []) as Metrics[]),
    nav,
    time: {
      ymd: local.ymd < today ? today : local.ymd,
      hhmm: `${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}`,
      minYmd: today,
    },
  };
}

/** Signs every slide of several media lists with one call per bucket; returns URLs in the same shape. */
async function signAll(supabase: Awaited<ReturnType<typeof createClient>>, lists: Media[][]): Promise<(string | null)[][]> {
  const bucketOf = (m: Media) => (m.bucket === "brand-assets" ? "brand-assets" : "post-media");
  const byBucket = new Map<string, Set<string>>();
  for (const list of lists) for (const m of list) {
    if (!m?.storage_path) continue;
    const b = bucketOf(m);
    byBucket.set(b, (byBucket.get(b) ?? new Set()).add(m.storage_path));
  }
  const urls = new Map<string, string>();
  await Promise.all([...byBucket].map(async ([bucket, paths]) => {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls([...paths], 3600);
    if (error) console.warn(`[post] signed urls failed for ${bucket}: ${error.message}`);
    for (const d of data ?? []) if (d.path && d.signedUrl) urls.set(`${bucket}:${d.path}`, d.signedUrl);
  }));
  return lists.map((list) => list.map((m) => (m?.storage_path ? urls.get(`${bucketOf(m)}:${m.storage_path}`) ?? null : null)));
}
