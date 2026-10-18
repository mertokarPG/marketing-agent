import { WEEKDAYS } from "@carepost/core/time";

const DAY_NAME: Record<string, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

export function postingDaysText(schedule: unknown): string {
  const raw = schedule && typeof schedule === "object" ? (schedule as { coreDays?: unknown }).coreDays : null;
  const days = Array.isArray(raw) ? WEEKDAYS.filter((d) => raw.includes(d)) : [];
  if (!days.length) return "Not set yet";
  if (days.length === 7) return "Every day";
  return days.map((d) => DAY_NAME[d]).join(", ");
}

export function approvalText(mode: string): string {
  return mode === "autopilot" ? "Posts go out on their own." : "Nothing goes out until you say OK.";
}

/** "Europe/Brussels" -> "Brussels time (Europe/Brussels)". */
export function timezoneText(tz: string): string {
  const city = tz.split("/").pop()?.replace(/_/g, " ");
  return city && tz.includes("/") ? `${city} time (${tz})` : tz;
}
