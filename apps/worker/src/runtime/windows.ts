import {
  addDaysYmd, coreSlots, formatLocal, localParts, mondayOfIsoWeek, zonedTimeToUtc,
  type BrandConfig, type RunKind,
} from "@carepost/core";
import type { RunWindow } from "./types.js";

export function runWindow(brand: BrandConfig, kind: RunKind, periodKey: string, now: Date): RunWindow {
  const tz = brand.timezone;
  if (kind === "weekly_plan") {
    const monday = mondayOfIsoWeek(periodKey);
    return { start: zonedTimeToUtc(monday, "00:00", tz), end: zonedTimeToUtc(addDaysYmd(monday, 7), "00:00", tz) };
  }
  if (kind === "daily_check") {
    const today = localParts(now, tz).ymd;
    return { start: new Date(now.getTime() + 2 * 3600_000), end: zonedTimeToUtc(addDaysYmd(today, 2), "00:00", tz) };
  }
  return { start: new Date(now.getTime() + 15 * 60_000), end: new Date(now.getTime() + 14 * 86400_000) };
}

export function buildBrief(brand: BrandConfig, kind: RunKind, periodKey: string, now: Date, userBrief?: string): string {
  const tz = brand.timezone;
  const w = runWindow(brand, kind, periodKey, now);
  const windowLine = `Allowed plannedAt window: ${w.start.toISOString()} → ${w.end.toISOString()} (UTC). Brand timezone: ${tz}. Local time now: ${formatLocal(now, tz)}.`;
  if (kind === "weekly_plan") {
    const slots = coreSlots(periodKey, brand.postingSchedule.coreDays, brand.postingSchedule.defaultTime, tz);
    const list = slots.map((s) => `- ${formatLocal(s.at, tz)} local → plannedAt ${s.at.toISOString()}`).join("\n");
    return `Plan and draft the CORE posts for ${brand.name} for ISO week ${periodKey}.
${windowLine}
First call get_planned_posts to see what already exists (including timely posts). Then draft one core post for each listed day below that does not already have a core post. The slots are suggestions:
${list}
Save each with save_post (kind "core", a one-paragraph rationale). One core post per listed day; set plannedAt at about the listed time. You may shift it within the same local day when the content's energy suits another time, but stay inside the allowed window. Do not publish anything; drafts go to the brand for review. Send a summary notification at the end.`;
  }
  if (kind === "daily_check") {
    return `Daily check for ${brand.name} (${periodKey}).
${windowLine}
Call get_planned_posts, then check today's hot topics and trends. Only if there is a strong, on-brand moment, draft at most ONE timely post for today or tomorrow and save it with save_post (kind "timely"). Otherwise save nothing and explain why in your final message.`;
  }
  return `${userBrief ?? `Manual run for ${brand.name}.`}
${windowLine}
Use save_post for anything you create (kind "core" unless told otherwise).`;
}
