import { addDaysYmd } from "@carepost/core/time";
import { currentWeekStart } from "../../../../lib/week";

export type MetricRow = { post_id: string; reach: number | null; saves: number | null; shares: number | null; measured_at: string };
type RPost = { id: string; planned_at: string };

/** Many snapshots per post are stored; only the newest one counts. */
export function latestMetricsPerPost<M extends MetricRow>(rows: M[]): Map<string, M> {
  const latest = new Map<string, M>();
  for (const r of rows) {
    const cur = latest.get(r.post_id);
    if (!cur || r.measured_at > cur.measured_at) latest.set(r.post_id, r);
  }
  return latest;
}

const inWindow = (iso: string, from: Date, to: Date) => {
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t < to.getTime();
};

/** Totals for posts planned in [from, to), from each post's latest snapshot. */
export function windowTotals(metrics: MetricRow[], posts: RPost[], from: Date, to: Date): { reach: number; savesShares: number } {
  const latest = latestMetricsPerPost(metrics);
  let reach = 0, savesShares = 0;
  for (const p of posts) {
    const m = latest.get(p.id);
    if (!m || !inWindow(p.planned_at, from, to)) continue;
    reach += m.reach ?? 0;
    savesShares += (m.saves ?? 0) + (m.shares ?? 0);
  }
  return { reach, savesShares };
}

export function changePct(cur: number, prev: number): number | null {
  return prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;
}

export function bestPosts<P extends RPost>(posts: P[], metrics: MetricRow[], from: Date, to: Date, n = 3): { post: P; reach: number; saves: number }[] {
  const latest = latestMetricsPerPost(metrics);
  return posts
    .filter((p) => latest.has(p.id) && inWindow(p.planned_at, from, to))
    .map((post) => ({ post, reach: latest.get(post.id)!.reach ?? 0, saves: latest.get(post.id)!.saves ?? 0 }))
    .sort((a, b) => b.reach - a.reach || b.saves - a.saves)
    .slice(0, n);
}

/** Reach per local week, oldest first, ending with the current week; empty weeks are 0. */
export function weeklyReach(posts: RPost[], metrics: MetricRow[], now: Date, tz: string, weeks = 13): { weekStart: string; reach: number }[] {
  const last = currentWeekStart(now, tz);
  const out = Array.from({ length: weeks }, (_, i) => ({ weekStart: addDaysYmd(last, -7 * (weeks - 1 - i)), reach: 0 }));
  const byWeek = new Map(out.map((w) => [w.weekStart, w]));
  const latest = latestMetricsPerPost(metrics);
  for (const p of posts) {
    const m = latest.get(p.id);
    if (!m) continue;
    const w = byWeek.get(currentWeekStart(new Date(p.planned_at), tz));
    if (w) w.reach += m.reach ?? 0;
  }
  return out;
}

/** First sentence of a rationale, for the one-line reason. */
export function firstSentence(text: string | null | undefined): string {
  const t = (text ?? "").trim().replace(/\s+/g, " ");
  const m = t.match(/^.*?[.!?](?=\s|$)/);
  return m ? m[0] : t;
}

/** Accept ?month= only as a real YYYY-MM within 2000–2100; otherwise the current month. */
export function resolveMonth(param: string | undefined, currentYm: string): string {
  const m = param?.match(/^(\d{4})-(\d{2})$/);
  if (!m) return currentYm;
  const y = Number(m[1]), mo = Number(m[2]);
  return y >= 2000 && y <= 2100 && mo >= 1 && mo <= 12 ? param! : currentYm;
}

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** Empty-state line for the results page, or null when there are numbers to show. */
export function resultsEmptyText(hasPublished: boolean, hasMetrics: boolean): string | null {
  if (hasMetrics) return null;
  return hasPublished
    ? "Your posts are out. Results show up once Instagram shares the numbers."
    : "Your results appear here once your first posts go out.";
}
