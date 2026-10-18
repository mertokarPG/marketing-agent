export type LabelTone = "needs" | "ok" | "muted" | "busy";

export function postLabel(
  p: { status: string; planned_at: string; needs_new_time: boolean },
  brand: { publisher: string | null; approval_mode: string },
  now: Date,
  /** redone: the agent's redo came back and nobody has changed the post since. */
  opts: { redone?: boolean } = {},
): { text: string; tone: LabelTone } {
  switch (p.status) {
    case "pending_approval":
      if (p.needs_new_time) return { text: "Pick a new time", tone: "needs" };
      return opts.redone ? { text: "New version · needs your OK", tone: "needs" } : { text: "Needs your OK", tone: "needs" };
    case "approved":
      if (brand.publisher) return { text: "Scheduled", tone: "ok" };
      return new Date(p.planned_at).getTime() > now.getTime()
        ? { text: "Ready · not connected to Instagram yet", tone: "muted" }
        : { text: "Ready · wasn't posted (Instagram not connected)", tone: "muted" };
    case "publishing": return { text: "Posting…", tone: "busy" };
    case "published": return { text: "Posted", tone: "ok" };
    case "reworking": return { text: "Reworking…", tone: "busy" };
    case "rejected": return { text: "Skipped", tone: "muted" };
    case "failed":
    case "expired": return { text: "Didn't go out", tone: "muted" };
    default: return { text: p.status, tone: "muted" };
  }
}
