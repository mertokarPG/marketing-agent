import { addDaysYmd, zonedTimeToUtc } from "@carepost/core/time";
import { createClient } from "@/lib/supabase/server";
import { buildWeek, currentWeekStart } from "@/lib/week";
import { greeting, firstNameFromEmail } from "@/lib/greeting";
import { Ribbon } from "@/components/ribbon";
import { NeedsYouCard } from "@/components/needs-you-card";
import { WeekGrid, WeekNav } from "@/components/week-grid";
import { ResultsStrip } from "@/components/results-strip";
import type { TilePost } from "@/components/post-tile";
import { isRedone, reworkingText, reworkMinutes, type Revision } from "@/lib/redo";
import { loadBrand } from "./brand-context";
import { waitingPosts, homeLede, firstGoesOut, postTitle, weekRangeLabel, resolveWeek, summarizeResults, showsNeedsYou } from "./home-data";

type Media = { storage_path: string; bucket?: string };
type Row = TilePost & { media: Media[] | null; last_changed_at: string | null };
const COLS = "id, status, planned_at, needs_new_time, caption, media, last_changed_at";

export default async function BrandHome({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const [{ slug }, { week }] = await Promise.all([params, searchParams]);
  const brand = await loadBrand(slug);
  const supabase = await createClient();
  const now = new Date();
  const tz = brand.timezone;
  const thisWeek = currentWeekStart(now, tz);
  const weekStart = resolveWeek(week, thisWeek);

  const { data: { user } } = await supabase.auth.getUser();
  const name = firstNameFromEmail(user?.email);

  const from = zonedTimeToUtc(weekStart, "00:00", tz).toISOString();
  const to = zonedTimeToUtc(addDaysYmd(weekStart, 7), "00:00", tz).toISOString();
  const since = new Date(now.getTime() - 14 * 86_400_000).toISOString();

  const [weekQ, waitQ, resQ] = await Promise.all([
    supabase.from("posts").select(COLS).eq("brand_id", brand.id).gte("planned_at", from).lt("planned_at", to).order("planned_at"),
    supabase.from("posts").select(COLS).eq("brand_id", brand.id).eq("status", "pending_approval").gt("planned_at", now.toISOString()).order("planned_at").limit(50),
    supabase.from("posts").select("id, planned_at, caption").eq("brand_id", brand.id).eq("status", "published").gte("planned_at", since).lte("planned_at", now.toISOString()),
  ]);
  for (const q of [weekQ, waitQ, resQ]) if (q.error) throw new Error(`home query failed: ${q.error.message}`);
  const weekPosts = (weekQ.data ?? []) as Row[];
  const waiting = waitingPosts((waitQ.data ?? []) as Row[], now);
  const published = resQ.data ?? [];

  const metricsQ = published.length
    ? await supabase.from("post_metrics").select("post_id, reach, measured_at").eq("brand_id", brand.id).in("post_id", published.map((p) => p.id)).order("measured_at", { ascending: false })
    : { data: [], error: null };
  if (metricsQ.error) throw new Error(`metrics query failed: ${metricsQ.error.message}`);
  const results = summarizeResults(published, metricsQ.data ?? [], now);

  // Redos: veils for posts being reworked (the feedback sent, how long it should take), and
  // "New version · needs your OK" for waiting posts whose redo came back untouched.
  const shownPosts = [...new Map([...weekPosts, ...waiting].map((p) => [p.id, p])).values()];
  const redoIds = shownPosts.filter((p) => p.status === "reworking" || p.status === "pending_approval").map((p) => p.id);
  const reworks: Record<string, string> = {};
  const redone: Record<string, boolean> = {};
  if (redoIds.length) {
    const hasReworking = shownPosts.some((p) => p.status === "reworking");
    const [revQ, genQ] = await Promise.all([
      supabase.from("post_revisions").select("post_id, status, feedback, created_at, finished_at").in("post_id", redoIds).order("created_at", { ascending: false }),
      hasReworking
        ? supabase.from("brands").select("image_generation").eq("id", brand.id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (revQ.error) console.warn(`[home] redo query failed: ${revQ.error.message}`);
    const byPost = new Map<string, Revision[]>();
    for (const r of (revQ.data ?? []) as (Revision & { post_id: string })[]) byPost.set(r.post_id, [...(byPost.get(r.post_id) ?? []), r]);
    const minutes = reworkMinutes(genQ.data?.image_generation);
    for (const p of shownPosts) {
      const revs = byPost.get(p.id) ?? [];
      if (p.status === "reworking") reworks[p.id] = reworkingText(revs[0]?.feedback ?? null, minutes, 40);
      else if (isRedone(p, revs)) redone[p.id] = true;
    }
  }

  // One signed-URL call per bucket for every visible tile.
  const wanted = new Map<string, { id: string; path: string }[]>();
  for (const p of [...weekPosts, ...waiting]) {
    const m = p.media?.[0];
    if (!m?.storage_path) continue;
    const bucket = m.bucket === "brand-assets" ? "brand-assets" : "post-media";
    wanted.set(bucket, [...(wanted.get(bucket) ?? []), { id: p.id, path: m.storage_path }]);
  }
  const thumbs: Record<string, string | null> = {};
  await Promise.all([...wanted].map(async ([bucket, items]) => {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls([...new Set(items.map((i) => i.path))], 3600);
    if (error) console.warn(`[home] signed urls failed for ${bucket}: ${error.message}`);
    const byPath = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
    for (const i of items) thumbs[i.id] = byPath.get(i.path) ?? null;
  }));

  const days = buildWeek(weekPosts, weekStart, tz);
  const first = waiting[0];
  const weekHasPosts = weekPosts.length > 0 || waiting.length > 0;
  const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric" });
  const bestTitle = results.best ? postTitle(results.best.caption) : null;

  return (
    <div className="page">
      <Ribbon />
      <h1 className="hero wide">{greeting(now, tz, name)}, <b>{name.toUpperCase()}.</b></h1>
      <p className="lede">{homeLede(brand, waiting.length, weekHasPosts)}</p>

      {showsNeedsYou(brand, waiting.length) && first && (
        <NeedsYouCard
          count={waiting.length}
          goesOut={firstGoesOut(first.planned_at, tz)}
          items={waiting.map((w) => ({ id: w.id, dayLabel: dayFmt.format(new Date(w.planned_at)), title: postTitle(w.caption), redone: !!redone[w.id] }))}
          reviewHref={`/b/${slug}/posts/${first.id}?review=1`}
        />
      )}

      <div className="section-t">
        <h2 className="t wide">This <b>week</b></h2>
        <WeekNav slug={slug} prev={addDaysYmd(weekStart, -7)} next={addDaysYmd(weekStart, 7)} label={weekRangeLabel(weekStart)} isCurrent={weekStart === thisWeek} />
      </div>
      <WeekGrid days={days} slug={slug} thumbs={thumbs} brand={brand} now={now} reworks={reworks} redone={redone} />

      <ResultsStrip slug={slug} reach={results.reach} changePct={results.changePct} bestTitle={bestTitle} />
      <p className="closing wide">Post <b>with care.</b></p>
    </div>
  );
}
