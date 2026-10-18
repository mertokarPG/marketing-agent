import Link from "next/link";

export function ResultsStrip({ slug, reach, changePct, bestTitle }: { slug: string; reach: number | null; changePct: number | null; bestTitle: string | null }) {
  return (
    <Link href={`/b/${slug}/results`} className="results" aria-label="See all results">
      <div><div className="big wide">{reach === null ? "—" : reach.toLocaleString("en-GB")}</div><span>people reached last week</span></div>
      <div><div className="big wide">{changePct === null ? "—" : `${changePct > 0 ? "+" : ""}${changePct}%`}</div><span>vs the week before</span></div>
      <div><div className="big wide">{bestTitle ? "01." : "—"}</div><span>{bestTitle ? `Best post: “${bestTitle}”` : "Best post shows up once results come in"}</span></div>
    </Link>
  );
}
