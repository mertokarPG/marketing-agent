import { zonedTimeToUtc } from "@carepost/core/time";

// Pure helpers for the post view. No server or browser imports here, so they stay unit-testable.

export const SOFT_LIMIT = 2000;
export const HARD_LIMIT = 2200;
export const MAX_HASHTAGS = 5;

const TAG = /^#[^\s#]+$/u;

/**
 * Editor text -> caption + hashtags. Hashtags are the trailing lines made only of #tags;
 * a #tag inside a line of text (or mid-caption) stays in the caption.
 */
export function parseCaption(text: string): { caption: string; hashtags: string[] } {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let cut = lines.length;
  const tagLines: string[][] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (t === "") { cut = i; continue; }
    const tokens = t.split(/\s+/);
    if (!tokens.every((tok) => TAG.test(tok))) break;
    tagLines.unshift(tokens);
    cut = i;
  }
  // Text of only hashtags yields an empty caption; captionProblem() then says so.
  return { caption: lines.slice(0, cut).join("\n").trimEnd(), hashtags: tagLines.flat() };
}

function normTags(hashtags: string[]): string[] {
  return hashtags.map((h) => h.trim()).filter((h) => h && h !== "#").map((h) => (h.startsWith("#") ? h : `#${h}`));
}

/** The hashtags field (one line, space or comma separated) -> the stored hashtags. */
export function parseTags(line: string): string[] {
  return normTags(line.split(/[\s,]+/));
}

/** caption + hashtags -> editor text, laid out exactly as it is published. */
export function joinCaption(caption: string, hashtags: string[]): string {
  const tags = normTags(hashtags);
  return tags.length ? `${caption}\n\n${tags.join(" ")}` : caption;
}

/** The length Instagram receives (matches the server's rule). */
export function publishedLength(caption: string, hashtags: string[]): number {
  return caption.length + (hashtags.length > 0 ? 2 + hashtags.join(" ").length : 0);
}

export function captionLimit(len: number): "ok" | "warn" | "over" {
  if (len > HARD_LIMIT) return "over";
  if (len >= SOFT_LIMIT) return "warn";
  return "ok";
}

/** Plain-words reason the caption can't be saved, or null when it can. */
export function captionProblem(caption: string, hashtags: string[]): string | null {
  if (caption.trim() === "") return "The caption can't be empty.";
  if (hashtags.length > MAX_HASHTAGS) return `Instagram allows up to ${MAX_HASHTAGS} hashtags. Remove some.`;
  if (publishedLength(caption, hashtags) > HARD_LIMIT) return "That caption is too long for Instagram. Please shorten it.";
  return null;
}

export function stepNav(waitingIds: string[], currentId: string): { prev: string | null; next: string | null; index: number; total: number } {
  const index = waitingIds.indexOf(currentId);
  const total = waitingIds.length;
  if (index < 0) return { prev: null, next: null, index: -1, total };
  return { prev: index > 0 ? waitingIds[index - 1] : null, next: index < total - 1 ? waitingIds[index + 1] : null, index, total };
}

export type ActionKind = "review" | "approved" | "autopilot" | "none";
export type PostActionsView = {
  kind: ActionKind;
  editable: boolean;
  results: boolean;
  approveBlocked: string | null;
  openTimePicker: boolean;
  note: string | null;
};

const PASSED = "The planned time has passed. Pick a new time.";

/** Which tools and buttons the post view shows, by status, approval mode and role. */
export function postActions(
  post: { status: string; planned_at: string; needs_new_time: boolean },
  brand: { approval_mode: string },
  role: string,
  now: Date,
): PostActionsView {
  const ro = (note: string | null, results = false): PostActionsView =>
    ({ kind: "none", editable: false, results, approveBlocked: null, openTimePicker: false, note });
  switch (post.status) {
    case "published": return ro(null, true);
    case "publishing": return ro("This post is going out now.");
    case "rejected": return ro("This post was skipped, so it won't go out.");
    case "failed": return ro("Instagram didn't accept this post, so it didn't go out.");
    case "expired": return ro("This post wasn't approved before its time, so it didn't go out.");
    case "reworking": return ro("The agent is reworking this post.");
    case "pending_approval":
    case "approved": break;
    default: return ro(null);
  }
  if (role !== "owner" && role !== "editor") return ro(null);
  const passed = post.needs_new_time || new Date(post.planned_at).getTime() <= now.getTime();
  const base = { editable: true, results: false, note: null };
  if (post.status === "pending_approval") {
    return { ...base, kind: "review", approveBlocked: passed ? PASSED : null, openTimePicker: post.needs_new_time };
  }
  return { ...base, kind: brand.approval_mode === "autopilot" ? "autopilot" : "approved", approveBlocked: null, openTimePicker: false };
}

function parts(iso: string | Date, tz: string, opts: Intl.DateTimeFormatOptions) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", ...opts }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
}

/** "TUE 20 · 10:00" in the brand timezone. */
export function goesOutLabel(iso: string, tz: string): string {
  const p = parts(iso, tz, { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return `${p.weekday.toUpperCase()} ${p.day} · ${p.hour}:${p.minute}`;
}

/** "Tuesday" in the brand timezone, for the header. */
export function weekdayName(iso: string, tz: string): string {
  return parts(iso, tz, { weekday: "long" }).weekday;
}

export function formatChip(count: number): string {
  if (count <= 0) return "No photos yet";
  return count === 1 ? "Single photo" : `Carousel · ${count} photos`;
}

/** What followers see before "more": the first two lines, cut at a word. */
export function previewCaption(text: string, max = 110): { text: string; more: boolean } {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  let out = lines.slice(0, 2).join(" ");
  let more = lines.length > 2;
  if (out.length > max) {
    const cut = out.slice(0, max);
    const sp = cut.lastIndexOf(" ");
    out = (sp > 0 ? cut.slice(0, sp) : cut).replace(/[\s.,;:!?…]+$/, "");
    more = true;
  }
  return { text: more ? `${out}…` : out, more };
}

/** "Last changed by you, Sun 18 Oct at 14:05". Other people's names aren't readable, so they get no name. */
export function lastChangedText(change: { by: string | null; at: string | null }, userId: string | null, tz: string): string | null {
  if (!change.at) return null;
  const p = parts(change.at, tz, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const when = `${p.weekday} ${p.day} ${p.month} at ${p.hour}:${p.minute}`;
  return change.by && userId && change.by === userId ? `Last changed by you, ${when}` : `Last changed ${when}`;
}

export function validLocalTime(ymd: string, hhmm: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || !/^\d{2}:\d{2}$/.test(hhmm)) return false;
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return false;
  const [hh, mm] = hhmm.split(":").map(Number);
  return hh < 24 && mm < 60;
}

export function isPastLocal(ymd: string, hhmm: string, tz: string, now: Date): boolean {
  return zonedTimeToUtc(ymd, hhmm, tz).getTime() <= now.getTime();
}

export type Metrics = { reach: number; saves: number; shares: number; likes: number; comments: number; measured_at: string };

export function latestMetrics(rows: Metrics[]): Metrics | null {
  let best: Metrics | null = null;
  for (const r of rows) if (!best || r.measured_at > best.measured_at) best = r;
  return best;
}
