import { rpcErrorMessage } from "./rpc-errors";

// Pure helpers for asking the agent to redo a post. No server or browser imports.

export const QUICK_PICKS = ["Shorter caption", "Different photos", "More playful", "More professional"] as const;
export const REDO_MAX = 500;
export const REDO_LIMIT = 3;
const TOO_CLOSE_MS = 30 * 60_000;

/** Quick picks, then the typed text, joined with ". " (without doubling a full stop). */
export function redoFeedback(typed: string, picks: string[]): string {
  const parts = [...new Set(picks.map((p) => p.trim()).filter(Boolean))];
  const text = typed.trim();
  if (text) parts.push(text);
  return parts.map((p, i) => (i < parts.length - 1 ? p.replace(/[.\s]+$/, "") : p)).join(". ");
}

export const PICK_TIME_FIRST = "Pick a new time first, then you can ask the agent.";

export type RedoAvailability = { show: false } | { show: true; allowed: true } | { show: true; allowed: false; reason: string };

/** Whether the redo box shows, and if a redo can't be asked for right now, the reason in plain words. */
export function redoAvailability(
  post: { status: string; planned_at: string; needs_new_time: boolean },
  brand: { status: string },
  role: string,
  revisions: { status: string }[],
  now: Date,
): RedoAvailability {
  if (role !== "owner" && role !== "editor") return { show: false };
  if (post.status !== "pending_approval" && post.status !== "approved") return { show: false };
  const no = (code: string): RedoAvailability => ({ show: true, allowed: false, reason: rpcErrorMessage({ message: `carepost:${code}` }) });
  if (brand.status === "paused") return no("paused");
  if (post.needs_new_time || new Date(post.planned_at).getTime() <= now.getTime()) {
    return { show: true, allowed: false, reason: PICK_TIME_FIRST };
  }
  if (new Date(post.planned_at).getTime() - now.getTime() < TOO_CLOSE_MS) return no("too_close");
  if (revisions.filter((r) => r.status !== "failed").length >= REDO_LIMIT) return no("redo_limit");
  return { show: true, allowed: true };
}

export type Revision = { status: string; feedback: string | null; created_at: string; finished_at: string | null };
export type RevisionState = { kind: "reworking"; feedback: string | null } | { kind: "failed" } | { kind: "none" };

/** What to say about the latest redo: in progress (with its feedback), failed since the page loaded, or nothing. */
export function latestRevisionState(status: string, revisions: Revision[], loadedAt: string): RevisionState {
  const latest = [...revisions].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  // The redo row is written in the same transaction that sets 'reworking', so the latest one is it.
  if (status === "reworking") return { kind: "reworking", feedback: latest?.feedback ?? null };
  if (latest?.status === "failed" && new Date(latest.finished_at ?? latest.created_at).getTime() > new Date(loadedAt).getTime()) {
    return { kind: "failed" };
  }
  return { kind: "none" };
}

/**
 * The agent's redo came back and nobody has changed the post since: the worker sets the post's
 * last_changed_at and the redo's finished_at in one transaction, and any later edit moves last_changed_at on.
 */
export function isRedone(post: { status: string; last_changed_at: string | null }, revisions: Revision[]): boolean {
  if (post.status !== "pending_approval") return false;
  const latest = [...revisions].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!latest || latest.status !== "done" || !latest.finished_at) return false;
  if (!post.last_changed_at) return true;
  return new Date(latest.finished_at).getTime() >= new Date(post.last_changed_at).getTime();
}

export const REDO_FAILED = "The agent couldn't rework this one. Your post is unchanged.";

/** Minutes to promise: new images make a redo slower. */
export function reworkMinutes(imageGeneration: unknown): 2 | 4 {
  return imageGeneration && typeof imageGeneration === "object" && (imageGeneration as { enabled?: unknown }).enabled === true ? 4 : 2;
}

/** "Reworking: 'more playful'… about 2 minutes", with the feedback shortened at a word when `max` is given. */
export function reworkingText(feedback: string | null, minutes: number, max?: number): string {
  let f = (feedback ?? "").trim().replace(/\s+/g, " ");
  if (!f) return `Reworking… about ${minutes} minutes`;
  if (max && f.length > max) {
    const cut = f.slice(0, max);
    const sp = cut.lastIndexOf(" ");
    f = `${(sp > 0 ? cut.slice(0, sp) : cut).replace(/[\s.,;:!?…]+$/, "")}…`;
  }
  return `Reworking: '${f}'… about ${minutes} minutes`;
}

/** "Version from Sun 18 Oct at 14:05, before redo: 'more playful'" in the brand timezone. */
export function versionLabel(v: { created_at: string; reason: string; feedback: string | null }, tz: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(v.created_at)).map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  const when = `${p.weekday} ${p.day} ${p.month} at ${p.hour}:${p.minute}`;
  if (v.reason === "redo") return v.feedback ? `Version from ${when}, before redo: '${v.feedback}'` : `Version from ${when}, before redo`;
  return `Version from ${when}, before restoring`;
}
