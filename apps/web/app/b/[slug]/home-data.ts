import { addDaysYmd } from "@carepost/core/time";

const DAY = 86_400_000;

export function waitingPosts<T extends { status: string; planned_at: string }>(posts: T[], now: Date): T[] {
  return posts
    .filter((p) => p.status === "pending_approval" && new Date(p.planned_at).getTime() > now.getTime())
    .sort((a, b) => new Date(a.planned_at).getTime() - new Date(b.planned_at).getTime());
}

export function homeLede(
  brand: { status: string; publisher: string | null; approval_mode: string },
  waitingCount: number,
  weekHasPosts: boolean,
): string {
  if (brand.status === "paused") return "Carepost is paused for this brand. Nothing will be planned or posted.";
  if (!weekHasPosts) return "Your first plan arrives Sunday morning.";
  const lead = "Your Instagram is planned for the week.";
  if (!brand.publisher) return `${lead} Nothing goes out until Instagram is connected.`;
  if (brand.approval_mode === "autopilot") return "Your Instagram is planned for the week and goes out on its own.";
  if (waitingCount > 0) {
    return `${lead} ${waitingCount} ${waitingCount === 1 ? "post is" : "posts are"} waiting for your OK; nothing goes out without it.`;
  }
  return `${lead} Nothing is waiting for your OK.`;
}

export function showsNeedsYou(brand: { approval_mode: string; status: string }, waitingCount: number): boolean {
  return brand.approval_mode !== "autopilot" && brand.status !== "paused" && waitingCount > 0;
}

export function firstGoesOut(iso: string, tz: string): { day: string; time: string } {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long" }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return { day, time };
}

/** First few words of a caption, first line only. */
export function postTitle(caption: string | null | undefined, words = 5): string {
  const line = (caption ?? "").split("\n").find((l) => l.trim()) ?? "";
  const w = line.trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "New post";
  return w.slice(0, words).join(" ").replace(/[.,;:!?…]+$/, "");
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function weekRangeLabel(weekStartYmd: string): string {
  const end = addDaysYmd(weekStartYmd, 6);
  const [, m1, d1] = weekStartYmd.split("-").map(Number);
  const [, m2, d2] = end.split("-").map(Number);
  return m1 === m2 ? `${MON[m1 - 1]} ${d1} – ${d2}` : `${MON[m1 - 1]} ${d1} – ${MON[m2 - 1]} ${d2}`;
}

/** Accept ?week= only if it is a Monday in YYYY-MM-DD form; otherwise use the current week. */
export function resolveWeek(param: string | undefined, currentStart: string): string {
  if (!param || !/^\d{4}-\d{2}-\d{2}$/.test(param)) return currentStart;
  const [y, m, d] = param.split("-").map(Number);
  if (y < 2000 || y > 2100) return currentStart;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return currentStart;
  return dt.getUTCDay() === 1 ? param : currentStart;
}

type RPost = { id: string; planned_at: string; caption: string | null };
type Metric = { post_id: string; reach: number | null; measured_at: string };

export function summarizeResults<P extends RPost>(posts: P[], metrics: Metric[], now: Date) {
  const latest = new Map<string, Metric>();
  for (const m of metrics) {
    const cur = latest.get(m.post_id);
    if (!cur || m.measured_at > cur.measured_at) latest.set(m.post_id, m);
  }
  const t = now.getTime();
  let reach = 0, prev = 0, has = false, hasPrev = false;
  let best: P | null = null, bestReach = -1;
  for (const p of posts) {
    const m = latest.get(p.id);
    if (!m) continue;
    const r = m.reach ?? 0;
    const age = t - new Date(p.planned_at).getTime();
    if (age >= 0 && age < 7 * DAY) {
      reach += r; has = true;
      if (r > bestReach) { best = p; bestReach = r; }
    } else if (age >= 7 * DAY && age < 14 * DAY) {
      prev += r; hasPrev = true;
    }
  }
  return {
    reach: has ? reach : null,
    changePct: has && hasPrev && prev > 0 ? Math.round(((reach - prev) / prev) * 100) : null,
    best,
  };
}

export const HOME_RESULTS_EMPTY = "Results show up here once your posts go out and Instagram shares the numbers.";

/** True once the home results strip has at least one real number or a best post to show. */
export function hasHomeResults(r: { reach: number | null; changePct: number | null; best: unknown }): boolean {
  return r.reach !== null || r.changePct !== null || r.best !== null;
}
