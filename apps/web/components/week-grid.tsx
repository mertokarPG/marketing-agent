import Link from "next/link";
import type { Day } from "@/lib/week";
import { PostTile, type TilePost } from "./post-tile";

export function WeekGrid({ days, slug, thumbs, brand, now, reworks = {}, redone = {}, redoFailed = {} }: {
  days: Day<TilePost>[];
  slug: string;
  thumbs: Record<string, string | null>;
  brand: { publisher: string | null; approval_mode: string };
  now: Date;
  /** Veil text for posts the agent is reworking, by post id. */
  reworks?: Record<string, string>;
  /** Posts whose redo came back untouched, by post id. */
  redone?: Record<string, boolean>;
  /** Posts whose redo failed with nothing changed since, by post id. */
  redoFailed?: Record<string, boolean>;
}) {
  return (
    <div className="week">
      {days.map((d) => (
        <div className="week-day" key={d.ymd}>
          <div className="day"><span>{d.weekday}</span><span className="d wide">{d.dayNum}</span></div>
          <div className="day-posts">
            {d.posts.length === 0 ? (
              <div className="rest">Rest day</div>
            ) : d.posts.map((p) => (
              <PostTile key={p.id} post={p} href={`/b/${slug}/posts/${p.id}`} thumb={thumbs[p.id] ?? null} brand={brand} now={now} rework={reworks[p.id]} redone={!!redone[p.id]} redoFailed={!!redoFailed[p.id]} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function WeekNav({ slug, prev, next, label, isCurrent }: { slug: string; prev: string; next: string; label: string; isCurrent: boolean }) {
  return (
    <span className="week-nav">
      <Link href={`/b/${slug}?week=${prev}`} aria-label="Previous week">‹</Link>
      <span>{label}</span>
      <Link href={`/b/${slug}?week=${next}`} aria-label="Next week">›</Link>
      {!isCurrent && <Link href={`/b/${slug}`} className="week-today">This week</Link>}
    </span>
  );
}
