import { addDaysYmd, zonedTimeToUtc } from "@carepost/core/time";
import { createClient } from "@/lib/supabase/server";
import { buildWeek, currentWeekStart } from "@/lib/week";
import { greeting, firstNameFromEmail } from "@/lib/greeting";
import { Ribbon } from "@/components/ribbon";
import { NeedsYouCard } from "@/components/needs-you-card";
import { WeekGrid, WeekNav } from "@/components/week-grid";
import { ResultsStrip } from "@/components/results-strip";
import type { TilePost } from "@/components/post-tile";
import { loadRedoState, signThumbs } from "@/lib/post-tiles";
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

  // Veils for posts being reworked and "New version · needs your OK" for untouched redos.
  const shownPosts = [...new Map([...weekPosts, ...waiting].map((p) => [p.id, p])).values()];
  const [{ reworks, redone }, thumbs] = await Promise.all([
    loadRedoState(supabase, brand.id, shownPosts, "home"),
    signThumbs(supabase, shownPosts, "home"),
  ]);

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
