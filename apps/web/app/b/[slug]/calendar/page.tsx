import Link from "next/link";
import { addDaysYmd, localParts, zonedTimeToUtc } from "@carepost/core/time";
import { createClient } from "@/lib/supabase/server";
import { buildMonth } from "@/lib/week";
import { PostTile, type TilePost } from "@/components/post-tile";
import { loadRedoState, signThumbs } from "@/lib/post-tiles";
import { loadBrand } from "../brand-context";
import { resolveMonth, shiftMonth, monthLabel } from "../results/results-data";

type Row = TilePost & { media: { storage_path: string; bucket?: string }[] | null; last_changed_at: string | null };
const COLS = "id, status, planned_at, needs_new_time, caption, media, last_changed_at";
const HEAD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function CalendarPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const [{ slug }, { month }] = await Promise.all([params, searchParams]);
  const brand = await loadBrand(slug);
  const supabase = await createClient();
  const now = new Date();
  const tz = brand.timezone;
  const thisMonth = localParts(now, tz).ymd.slice(0, 7);
  const ym = resolveMonth(month, thisMonth);

  // The grid starts on the Monday on/before the 1st and runs 42 days; fetch exactly that window.
  const empty = buildMonth<Row>([], ym, tz);
  const from = zonedTimeToUtc(empty[0].ymd, "00:00", tz).toISOString();
  const to = zonedTimeToUtc(addDaysYmd(empty[41].ymd, 1), "00:00", tz).toISOString();
  const { data, error } = await supabase.from("posts").select(COLS).eq("brand_id", brand.id).gte("planned_at", from).lt("planned_at", to).order("planned_at");
  if (error) throw new Error(`calendar query failed: ${error.message}`);
  const posts = (data ?? []) as Row[];

  const [{ reworks, redone }, thumbs] = await Promise.all([
    loadRedoState(supabase, brand.id, posts, "calendar"),
    signThumbs(supabase, posts, "calendar"),
  ]);
  const days = buildMonth(posts, ym, tz);
  const inMonth = (ymd: string) => ymd.startsWith(ym);
  const monthHasPosts = days.some((d) => inMonth(d.ymd) && d.posts.length > 0);

  return (
    <div>
      <div className="section-t">
        <h1 className="t wide">{monthLabel(ym).split(" ")[0]} <b>{monthLabel(ym).split(" ")[1]}</b></h1>
        <span className="week-nav">
          <Link href={`/b/${slug}/calendar?month=${shiftMonth(ym, -1)}`} aria-label="Previous month">‹</Link>
          <span>{monthLabel(ym)}</span>
          <Link href={`/b/${slug}/calendar?month=${shiftMonth(ym, 1)}`} aria-label="Next month">›</Link>
          {ym !== thisMonth && <Link href={`/b/${slug}/calendar`} className="week-today">This month</Link>}
        </span>
      </div>
      {!monthHasPosts && <p className="lede">Nothing is planned for {monthLabel(ym)}.</p>}
      <div className="month-head" aria-hidden="true">{HEAD.map((h) => <span key={h}>{h}</span>)}</div>
      <div className="month">
        {days.map((d) => (
          <div key={d.ymd} className={`month-day${inMonth(d.ymd) ? "" : " out"}${d.posts.length ? "" : " empty"}`}>
            <div className="day"><span>{d.weekday}</span><span className="d wide">{d.dayNum}</span></div>
            <div className="day-posts">
              {d.posts.map((p) => (
                <PostTile key={p.id} post={p} href={`/b/${slug}/posts/${p.id}`} thumb={thumbs[p.id] ?? null} brand={brand} now={now} rework={reworks[p.id]} redone={!!redone[p.id]} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
