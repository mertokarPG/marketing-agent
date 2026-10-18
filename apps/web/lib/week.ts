import { addDaysYmd, localParts } from "@carepost/core/time";

type P = { id: string; planned_at: string };
export type Day<T extends P> = { ymd: string; weekday: string; dayNum: number; posts: T[] };

const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const wdIndex = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
};

function grid<T extends P>(posts: T[], startYmd: string, count: number, tz: string): Day<T>[] {
  const days: Day<T>[] = Array.from({ length: count }, (_, i) => {
    const ymd = addDaysYmd(startYmd, i);
    return { ymd, weekday: WD[wdIndex(ymd)], dayNum: Number(ymd.slice(8)), posts: [] };
  });
  const byYmd = new Map(days.map((d) => [d.ymd, d]));
  for (const p of [...posts].sort((a, b) => a.planned_at.localeCompare(b.planned_at) || new Date(a.planned_at).getTime() - new Date(b.planned_at).getTime())) {
    byYmd.get(localParts(new Date(p.planned_at), tz).ymd)?.posts.push(p);
  }
  return days;
}

export function buildWeek<T extends P>(posts: T[], weekStartYmd: string, tz: string): Day<T>[] {
  return grid(posts, weekStartYmd, 7, tz);
}

/** 6x7 calendar grid for `monthYm` ("YYYY-MM"), starting on the Monday on/before the 1st. */
export function buildMonth<T extends P>(posts: T[], monthYm: string, tz: string): Day<T>[] {
  const first = `${monthYm}-01`;
  return grid(posts, addDaysYmd(first, -wdIndex(first)), 42, tz);
}

export function currentWeekStart(now: Date, tz: string): string {
  const ymd = localParts(now, tz).ymd;
  return addDaysYmd(ymd, -wdIndex(ymd));
}
