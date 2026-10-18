import { addDaysYmd, zonedTimeToUtc } from "@carepost/core/time";
import { createClient } from "@/lib/supabase/server";
import { currentWeekStart } from "@/lib/week";
import { Ribbon } from "@/components/ribbon";
import { TrendLine } from "@/components/trend-line";
import { signThumbs } from "@/lib/post-tiles";
import { loadBrand } from "../brand-context";
import { postTitle } from "../home-data";
import { bestPosts, changePct, firstSentence, weeklyReach, windowTotals, type MetricRow } from "./results-data";

const DAY = 86_400_000;
type PRow = { id: string; planned_at: string; caption: string | null; rationale: string; media: { storage_path: string; bucket?: string }[] | null };

function Change({ pct }: { pct: number | null }) {
  return <span>{pct === null ? "No earlier numbers to compare" : `${pct > 0 ? "+" : ""}${pct}% vs the 30 days before`}</span>;
}

export default async function ResultsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const brand = await loadBrand(slug);
  const supabase = await createClient();
  const now = new Date();
  const tz = brand.timezone;

  // Posts from the oldest of: 60 days (this vs previous 30) and the 13-week trend start.
  const trendStart = zonedTimeToUtc(addDaysYmd(currentWeekStart(now, tz), -12 * 7), "00:00", tz);
  const since = new Date(Math.min(trendStart.getTime(), now.getTime() - 60 * DAY));
  const [postsQ, insightQ] = await Promise.all([
    supabase.from("posts").select("id, planned_at, caption, rationale, media").eq("brand_id", brand.id).eq("status", "published").gte("planned_at", since.toISOString()).lte("planned_at", now.toISOString()),
    supabase.from("brand_insights").select("body").eq("brand_id", brand.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (postsQ.error) throw new Error(`results query failed: ${postsQ.error.message}`);
  if (insightQ.error) console.warn(`[results] insights query failed: ${insightQ.error.message}`);
  const posts = (postsQ.data ?? []) as PRow[];

  // PostgREST caps a response at 1000 rows and a post has many snapshots, so ask in small chunks, newest first.
  const ids = posts.map((p) => p.id);
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
  const metricQs = await Promise.all(chunks.map((c) =>
    supabase.from("post_metrics").select("post_id, reach, saves, shares, measured_at").eq("brand_id", brand.id).in("post_id", c).order("measured_at", { ascending: false }),
  ));
  for (const q of metricQs) if (q.error) throw new Error(`metrics query failed: ${q.error.message}`);
  const metrics = metricQs.flatMap((q) => (q.data ?? []) as MetricRow[]);

  const hasResults = metrics.length > 0;
  const curFrom = new Date(now.getTime() - 30 * DAY), prevFrom = new Date(now.getTime() - 60 * DAY);
  const cur = windowTotals(metrics, posts, curFrom, now);
  const prev = windowTotals(metrics, posts, prevFrom, curFrom);
  const best = bestPosts(posts, metrics, curFrom, now);
  const weeks = weeklyReach(posts, metrics, now, tz);
  const thumbs = await signThumbs(supabase, best.map((b) => b.post), "results");
  const learned = String(insightQ.data?.body ?? "").split("\n").map((l) => l.replace(/^\s*[-*•]\s*/, "").trim()).filter(Boolean);
  const n = (v: number) => v.toLocaleString("en-GB");

  return (
    <div className="page">
      <Ribbon />
      <h1 className="hero wide">Your <b>results.</b></h1>
      {!hasResults ? (
        <p className="lede">Your results appear here once your first posts go out.</p>
      ) : (
        <>
          <p className="lede">The last 30 days.</p>
          <div className="results static">
            <div><div className="big wide">{n(cur.reach)}</div><span>people reached</span><Change pct={changePct(cur.reach, prev.reach)} /></div>
            <div><div className="big wide">{n(cur.savesShares)}</div><span>saves &amp; shares</span><Change pct={changePct(cur.savesShares, prev.savesShares)} /></div>
            <div><div className="big wide">—</div><span>Followers appear once Instagram is connected</span></div>
          </div>

          {best.length > 0 && (
            <section className="res-section">
              <h2 className="t wide">Your best <b>posts</b></h2>
              <ol className="best">
                {best.map((b, i) => {
                  const why = firstSentence(b.post.rationale);
                  return (
                    <li key={b.post.id}>
                      <div className="best-img">
                        {thumbs[b.post.id] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumbs[b.post.id]!} alt="" loading="lazy" />
                        ) : <span className="tile-ph wide">{postTitle(b.post.caption, 6)}</span>}
                      </div>
                      <div className="best-n wide">{String(i + 1).padStart(2, "0")}.</div>
                      <strong>{postTitle(b.post.caption, 8)}</strong>
                      <span>{n(b.reach)} people reached · {n(b.saves)} saves</span>
                      {why && <p>{why}</p>}
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {learned.length > 0 && (
            <section className="res-section">
              <h2 className="t wide">What the agent <b>learned</b></h2>
              <ul className="learned">{learned.map((l, i) => <li key={i}>{l}</li>)}</ul>
            </section>
          )}

          <section className="res-section">
            <h2 className="t wide">Weekly <b>reach</b></h2>
            <TrendLine weeks={weeks} />
          </section>
        </>
      )}
    </div>
  );
}
