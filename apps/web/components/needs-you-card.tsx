import Link from "next/link";

export type Waiting = { id: string; dayLabel: string; title: string };

export function NeedsYouCard({ count, goesOut, items, reviewHref }: {
  count: number;
  goesOut: { day: string; time: string };
  items: Waiting[];
  reviewHref: string;
}) {
  return (
    <section className="card needs-card" aria-label="Needs you">
      <div className="card-head"><small>Needs you</small><h2 className="t wide">{count} {count === 1 ? "post" : "posts"} to review</h2></div>
      <div className="card-body">
        <div className="block"><span className="n wide">{count}</span></div>
        <div className="copy">The first one goes out <b>{goesOut.day} at {goesOut.time}</b>. Take a look, tweak the caption if you like, and approve.</div>
        <div className="list">
          {items.slice(0, 6).map((it, i) => (
            <div key={it.id}><span className="num wide">{String(i + 1).padStart(2, "0")}.</span><span>{it.dayLabel} · {it.title}</span></div>
          ))}
          <div className="list-cta"><Link href={reviewHref} className="pill">Review posts ↳</Link></div>
        </div>
      </div>
    </section>
  );
}
