const W = 600, H = 170, PX = 12, PT = 14, PB = 10;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (ymd: string) => `${Number(ymd.slice(8))} ${MON[Number(ymd.slice(5, 7)) - 1]}`;

/** Weekly reach as a hand-rolled SVG line. Scales to its container; readable at 390px. */
export function TrendLine({ weeks }: { weeks: { weekStart: string; reach: number }[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.reach));
  const step = weeks.length > 1 ? (W - 2 * PX) / (weeks.length - 1) : 0;
  const pts = weeks.map((w, i) => ({ x: PX + i * step, y: PT + (1 - w.reach / max) * (H - PT - PB), w }));
  const peak = weeks.reduce((a, b) => (b.reach > a.reach ? b : a), weeks[0]);
  const summary = `Weekly reach over the last ${weeks.length} weeks. Most recent week: ${weeks[weeks.length - 1].reach.toLocaleString("en-GB")} people. Best week: ${peak.reach.toLocaleString("en-GB")} people, week of ${short(peak.weekStart)}.`;
  return (
    <figure className="trend">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} preserveAspectRatio="none">
        <title>{summary}</title>
        <line x1={PX} x2={W - PX} y1={H - PB} y2={H - PB} className="trend-axis" />
        <polyline points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} className="trend-line" fill="none" vectorEffect="non-scaling-stroke" />
        {pts.map((p) => <circle key={p.w.weekStart} cx={p.x} cy={p.y} r="3.5" className="trend-dot" vectorEffect="non-scaling-stroke"><title>{`Week of ${short(p.w.weekStart)}: ${p.w.reach.toLocaleString("en-GB")} people`}</title></circle>)}
      </svg>
      <figcaption><span>{short(weeks[0].weekStart)}</span><span>Now</span></figcaption>
    </figure>
  );
}
