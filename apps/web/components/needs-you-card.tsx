import Link from "next/link";

export type Waiting = { id: string; dayLabel: string; title: string; redone?: boolean };

export function NeedsYouCard({ count, firstLine, items, reviewHref }: {
  count: number;
  /** From needsYouFirstLine: when the first one goes out, or that posts need a new time. */
  firstLine: { before: string; strong: string; after: string };
  items: Waiting[];
  reviewHref: string;
}) {
  return (
    <section className="card needs-card" aria-label="Needs you">
      <div className="card-head"><small>Needs you</small><h2 className="t wide">{count} {count === 1 ? "post" : "posts"} to review</h2></div>
      <div className="card-body">
        <div className="block"><span className="n wide">{count}</span></div>
        <div className="copy">{firstLine.before}<b>{firstLine.strong}</b>{firstLine.after}</div>
        <div className="list">
          {items.slice(0, 6).map((it, i) => (
            <div key={it.id}><span className="num wide">{String(i + 1).padStart(2, "0")}.</span><span>{it.dayLabel} · {it.title}{it.redone ? " · new version" : ""}</span></div>
          ))}
          <div className="list-cta"><Link href={reviewHref} className="pill">Review posts ↳</Link></div>
        </div>
      </div>
    </section>
  );
}
