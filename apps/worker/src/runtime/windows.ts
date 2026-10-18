import {
  addDaysYmd, coreSlots, formatLocal, localParts, mondayOfIsoWeek, zonedTimeToUtc,
  type BrandConfig, type RunKind,
} from "@carepost/core";
import type { RunWindow } from "./types.js";
import type { ReviseBriefContext } from "./revise.js";

export function runWindow(brand: BrandConfig, kind: RunKind, periodKey: string, now: Date): RunWindow {
  const tz = brand.timezone;
  if (kind === "weekly_plan") {
    const monday = mondayOfIsoWeek(periodKey);
    // A weekly plan run mid-week (e.g. the first plan after cutover) must never backdate posts.
    const start = Math.max(zonedTimeToUtc(monday, "00:00", tz).getTime(), now.getTime() + 15 * 60_000);
    return { start: new Date(start), end: zonedTimeToUtc(addDaysYmd(monday, 7), "00:00", tz) };
  }
  if (kind === "daily_check") {
    const today = localParts(now, tz).ymd;
    return { start: new Date(now.getTime() + 2 * 3600_000), end: zonedTimeToUtc(addDaysYmd(today, 2), "00:00", tz) };
  }
  return { start: new Date(now.getTime() + 15 * 60_000), end: new Date(now.getTime() + 14 * 86400_000) };
}

export function buildBrief(
  brand: BrandConfig, kind: RunKind, periodKey: string, now: Date, userBrief?: string, revise?: ReviseBriefContext
): string {
  const tz = brand.timezone;
  if (kind === "revise") {
    if (!revise) throw new Error("a revise brief needs the post and feedback");
    const slides = revise.slides.map((s, i) => `${i + 1}. ${s}`).join("\n");
    return `Rework ONE existing post for ${brand.name} based on the owner's feedback (revision ${periodKey}).
Brand timezone: ${tz}. Local time now: ${formatLocal(now, tz)}. The post goes out ${formatLocal(revise.plannedAt, tz)} local.

Owner's feedback (verbatim):
"""
${revise.feedback}
"""

Current caption:
"""
${revise.caption}
"""
Current hashtags: ${revise.hashtags.length ? revise.hashtags.join(" ") : "(none)"}
Current slides (${revise.slides.length} slide${revise.slides.length === 1 ? "" : "s"}, in order; pass a path to revise_post to keep that slide):
${slides || "(none)"}

Change what the feedback asks for and keep what it doesn't touch. Keep the date and time unless the feedback asks otherwise; revise_post cannot move the post, so if the feedback asks for another time, say so in the rationale and the owner will reschedule it. You may rewrite the caption and hashtags, reorder, drop or swap slides, use the brand's product photos, re-render text slides, and create new images if your tools allow it. When done, call revise_post exactly once with the complete new version, then stop. Do not send notifications.`;
  }
  const w = runWindow(brand, kind, periodKey, now);
  const windowLine = `Allowed plannedAt window: ${w.start.toISOString()} → ${w.end.toISOString()} (UTC). Brand timezone: ${tz}. Local time now: ${formatLocal(now, tz)}.`;
  if (kind === "weekly_plan") {
    const slots = coreSlots(periodKey, brand.postingSchedule.coreDays, brand.postingSchedule.defaultTime, tz)
      .filter((s) => s.at >= w.start && s.at < w.end);
    const list = slots.map((s) => `- ${formatLocal(s.at, tz)} local → plannedAt ${s.at.toISOString()}`).join("\n");
    return `Plan and draft the CORE posts for ${brand.name} for ISO week ${periodKey}.
${windowLine}
First call get_planned_posts to see what already exists (including timely posts). Then draft one core post for each listed day below that does not already have a core post. The slots are suggestions:
${list}
Save each with save_post (kind "core", a one-paragraph rationale). One core post per listed day; set plannedAt at about the listed time. You may shift it within the same local day when the content's energy suits another time, but stay inside the allowed window. Do not publish anything; drafts go to the brand for review. Before the summary, call save_learnings with 2–3 plain-language learnings from recent performance (get_post_performance). Send a summary notification at the end.`;
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
