import { addDaysYmd, enqueueRun, isoWeekKey, listActiveBrands, localParts, zonedTimeToUtc, WEEKDAYS, type Db } from "@carepost/core";

type Kind = "weekly_plan" | "daily_check";
interface Candidate { kind: Kind; periodKey: string; at: Date }

const CATCH_UP_MS = 6 * 3600_000;

/** Most recent scheduled occurrence of each run kind at or before `now`, in brand-local time. */
function candidates(now: Date, tz: string): Candidate[] {
  const { ymd, weekday } = localParts(now, tz);
  const sunday = addDaysYmd(ymd, -((WEEKDAYS.indexOf(weekday) + 1) % 7));
  return [
    { kind: "daily_check", periodKey: ymd, at: zonedTimeToUtc(ymd, "08:00", tz) },
    // Sunday 09:00 local plans the coming ISO week (starting Monday).
    { kind: "weekly_plan", periodKey: isoWeekKey(addDaysYmd(sunday, 1)), at: zonedTimeToUtc(sunday, "09:00", tz) },
  ];
}

const inWindow = (now: Date, at: Date) => now >= at && now.getTime() - at.getTime() < CATCH_UP_MS;
const tooLate = (now: Date, at: Date) => now.getTime() - at.getTime() >= CATCH_UP_MS;

export function dueRuns(now: Date, tz: string): { kind: Kind; periodKey: string }[] {
  return candidates(now, tz)
    .filter((c) => inWindow(now, c.at))
    .map(({ kind, periodKey }) => ({ kind, periodKey }));
}

const loggedSkips = new Set<string>();

export async function schedulerTick(db: Db, now: Date, skipLog: Set<string> = loggedSkips): Promise<number> {
  let enqueued = 0;
  for (const brand of await listActiveBrands(db)) {
    for (const r of dueRuns(now, brand.timezone)) {
      if (await enqueueRun(db, brand.id, r.kind, r.periodKey)) enqueued++;
    }
    // Runs whose catch-up window has closed without ever being enqueued are skipped; say so once per process.
    for (const c of candidates(now, brand.timezone)) {
      if (!tooLate(now, c.at)) continue;
      const key = `${brand.id}|${c.kind}|${c.periodKey}`;
      if (skipLog.has(key)) continue;
      const existing = await db.query(
        "select 1 from agent_runs where brand_id = $1 and kind = $2 and period_key = $3", [brand.id, c.kind, c.periodKey]);
      if (existing.length > 0) { skipLog.add(key); continue; }
      skipLog.add(key);
      const lateH = ((now.getTime() - c.at.getTime()) / 3600_000).toFixed(1);
      console.warn(`[scheduler] skipped ${c.kind} ${c.periodKey} for brand ${brand.slug} (${brand.id}): ${lateH}h past schedule, beyond 6h catch-up window`);
    }
  }
  return enqueued;
}
