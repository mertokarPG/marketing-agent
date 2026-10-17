import { formatLocal, type PostRow } from "@carepost/core";

export function formatPlannedPosts(rows: PostRow[], tz: string): string {
  if (rows.length === 0) return "No planned posts in the next 7 days.";
  return rows
    .map((p) => `- ${formatLocal(p.planned_at, tz)} · ${p.kind} · ${p.status} · ${p.caption.split("\n")[0].slice(0, 100)}`)
    .join("\n");
}
