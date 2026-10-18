import { notFound } from "next/navigation";
import { localParts } from "@carepost/core/time";
import { createClient } from "@/lib/supabase/server";
import { postLabel } from "@/lib/labels";
import { loadBrand } from "../../brand-context";
import { waitingPosts } from "../../home-data";
import {
  postActions, stepNav, goesOutLabel, weekdayName, formatChip, lastChangedText, latestMetrics,
  type PostActionsView, type Metrics,
} from "./post-data";

type Media = { storage_path: string; bucket?: string | null };

export type PostViewData = {
  slug: string;
  post: { id: string; caption: string; hashtags: string[]; rationale: string; needs_new_time: boolean };
  slides: (string | null)[];
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
  const [slides, metricsQ, waitQ] = await Promise.all([
    signSlides(supabase, media),
    post.status === "published"
      ? supabase.from("post_metrics").select("reach, saves, shares, likes, comments, measured_at")
          .eq("post_id", post.id).order("measured_at", { ascending: false }).limit(1)
      : Promise.resolve({ data: [], error: null }),
    review
      ? supabase.from("posts").select("id, status, planned_at").eq("brand_id", brand.id)
          .eq("status", "pending_approval").gt("planned_at", now.toISOString()).order("planned_at").limit(50)
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (metricsQ.error) throw new Error(`metrics query failed: ${metricsQ.error.message}`);
  if (waitQ.error) throw new Error(`waiting query failed: ${waitQ.error.message}`);

  let nav: PostViewData["nav"] = null;
  if (review && waitQ.data) {
    const n = stepNav(waitingPosts(waitQ.data, now).map((w) => w.id), post.id);
    if (n.index >= 0 && n.total > 1) nav = n;
  }

  const local = localParts(new Date(post.planned_at), tz);
  const today = localParts(now, tz).ymd;
  return {
    slug,
    post: {
      id: post.id,
      caption: post.caption ?? "",
      hashtags: post.hashtags ?? [],
      rationale: post.rationale ?? "",
      needs_new_time: post.needs_new_time,
    },
    slides,
    brand: { name: brand.name, handle: brand.instagram_handle ?? brand.slug, logoUrl: brand.logoUrl, timezone: tz },
    actions: postActions(post, brand, brand.role, now),
    label: postLabel(post, brand, now),
    weekday: weekdayName(post.planned_at, tz),
    goesOut: goesOutLabel(post.planned_at, tz),
    chip: formatChip(media.length),
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

async function signSlides(supabase: Awaited<ReturnType<typeof createClient>>, media: Media[]): Promise<(string | null)[]> {
  const byBucket = new Map<string, string[]>();
  for (const m of media) {
    if (!m?.storage_path) continue;
    const b = m.bucket === "brand-assets" ? "brand-assets" : "post-media";
    byBucket.set(b, [...(byBucket.get(b) ?? []), m.storage_path]);
  }
  const urls = new Map<string, string>();
  await Promise.all([...byBucket].map(async ([bucket, paths]) => {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls([...new Set(paths)], 3600);
    if (error) console.warn(`[post] signed urls failed for ${bucket}: ${error.message}`);
    for (const d of data ?? []) if (d.path && d.signedUrl) urls.set(`${bucket}:${d.path}`, d.signedUrl);
  }));
  return media.map((m) => (m?.storage_path ? urls.get(`${m.bucket === "brand-assets" ? "brand-assets" : "post-media"}:${m.storage_path}`) ?? null : null));
}
