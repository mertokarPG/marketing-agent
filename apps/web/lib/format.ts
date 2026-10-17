export function formatPlanned(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(new Date(iso)).replace(/^(\w+),? (\d+) (\w+),? /, "$1 $2 $3, ");
}
const LABELS: Record<string, string> = {
  pending_approval: "Needs your OK", approved: "Scheduled", publishing: "Posting…", published: "Posted",
  failed: "Failed", rejected: "Skipped", expired: "Expired (not approved in time)",
};
export const statusLabel = (s: string) => LABELS[s] ?? s;
