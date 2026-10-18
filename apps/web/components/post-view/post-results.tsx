import type { Metrics } from "@/app/b/[slug]/posts/[id]/post-data";

const ROWS: [keyof Omit<Metrics, "measured_at">, string][] = [
  ["reach", "People reached"],
  ["saves", "Saves"],
  ["shares", "Shares"],
  ["likes", "Likes"],
  ["comments", "Comments"],
];

/** Results of a posted post, from the newest snapshot. */
export function PostResults({ metrics }: { metrics: Metrics | null }) {
  return (
    <div className="pv-results">
      <div className="pv-label"><span>How it did</span></div>
      {metrics ? (
        <dl>
          {ROWS.map(([k, label]) => (
            <div key={k}>
              <dt>{label}</dt>
              <dd className="wide">{metrics[k].toLocaleString("en-GB")}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="cap-help">Results show up here a day or so after the post goes out.</p>
      )}
    </div>
  );
}
