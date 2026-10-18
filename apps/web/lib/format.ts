import { postLabel } from "./labels";
export function formatPlanned(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(new Date(iso)).replace(/^(\w+),? (\d+) (\w+),? /, "$1 $2 $3, ");
}
// Kept for existing pages; delegates to the shared labels (brand-agnostic: assumes a connected publisher).
export const statusLabel = (s: string) =>
  postLabel({ status: s, planned_at: "", needs_new_time: false }, { publisher: "x", approval_mode: "manual" }, new Date()).text;
