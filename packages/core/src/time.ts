export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export const WEEKDAYS: readonly Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", weekday: "short",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

function parts(date: Date, tz: string): Record<string, string> {
  return Object.fromEntries(fmt(tz).formatToParts(date).map((p) => [p.type, p.value]));
}

export function localParts(date: Date, tz: string) {
  const p = parts(date, tz);
  return {
    ymd: `${p.year}-${p.month}-${p.day}`,
    hour: Number(p.hour),
    minute: Number(p.minute),
    weekday: p.weekday.toLowerCase().slice(0, 3) as Weekday,
  };
}

function offsetMs(date: Date, tz: string): number {
  const p = parts(date, tz);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Brand-local wall time to UTC.
 * DST policy: an ambiguous local time (fall-back overlap, e.g. 02:30 on 2026-10-25)
 * resolves to the EARLIER instant; a nonexistent local time (spring-forward gap,
 * e.g. 02:30 on 2026-03-29) is shifted FORWARD past the gap (to 03:30 local).
 */
export function zonedTimeToUtc(ymd: string, hhmm: string, tz: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const DAY = 86400000;
  // Offsets in force a day before/after bracket any transition near the wall time.
  const before = offsetMs(new Date(guess - DAY), tz);
  const after = offsetMs(new Date(guess + DAY), tz);
  const candidates = [...new Set([guess - before, guess - after])]
    .sort((a, b) => a - b)
    .filter((t) => offsetMs(new Date(t), tz) === guess - t);
  // Valid candidates: earliest wins (ambiguous). None: in the gap, so use the pre-gap offset (shifts forward).
  return new Date(candidates.length ? candidates[0] : guess - before);
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function isoWeekKey(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (date.getUTCDay() + 6) % 7; // Monday = 0
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // Thursday of this week
  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

export function mondayOfIsoWeek(key: string): string {
  const m = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!m) throw new Error(`Invalid ISO week key: ${key}`);
  const year = Number(m[1]);
  const week = Number(m[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const mondayW1 = Date.UTC(year, 0, 4 - ((jan4.getUTCDay() + 6) % 7));
  return new Date(mondayW1 + (week - 1) * 7 * 86400000).toISOString().slice(0, 10);
}

export function formatLocal(date: Date, tz: string): string {
  const p = localParts(date, tz);
  const wd = p.weekday[0].toUpperCase() + p.weekday.slice(1);
  return `${wd} ${p.ymd} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export function coreSlots(weekKey: string, coreDays: Weekday[], defaultTime: string, tz: string) {
  const monday = mondayOfIsoWeek(weekKey);
  return WEEKDAYS.map((weekday, i) => ({ weekday, ymd: addDaysYmd(monday, i) }))
    .filter((s) => coreDays.includes(s.weekday))
    .map((s) => ({ ...s, at: zonedTimeToUtc(s.ymd, defaultTime, tz) }));
}
