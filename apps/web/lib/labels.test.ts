import { describe, it, expect } from "vitest";
import { postLabel } from "./labels";

const now = new Date("2026-10-19T12:00:00Z");
const future = "2026-10-20T08:00:00Z";
const past = "2026-10-18T08:00:00Z";
type Brand = { publisher: string | null; approval_mode: string };
const pub: Brand = { publisher: "postiz", approval_mode: "review" };
const nopub: Brand = { publisher: null, approval_mode: "review" };

const rows: [string, { status: string; planned_at: string; needs_new_time: boolean }, Brand, string, string][] = [
  ["pending", { status: "pending_approval", planned_at: future, needs_new_time: false }, pub, "Needs your OK", "needs"],
  ["pending new time", { status: "pending_approval", planned_at: future, needs_new_time: true }, pub, "Pick a new time", "needs"],
  ["approved publisher", { status: "approved", planned_at: future, needs_new_time: false }, pub, "Scheduled", "ok"],
  ["approved no publisher future", { status: "approved", planned_at: future, needs_new_time: false }, nopub, "Ready · not connected to Instagram yet", "muted"],
  ["approved no publisher past", { status: "approved", planned_at: past, needs_new_time: false }, nopub, "Ready · wasn't posted (Instagram not connected)", "muted"],
  ["publishing", { status: "publishing", planned_at: past, needs_new_time: false }, pub, "Posting…", "busy"],
  ["published", { status: "published", planned_at: past, needs_new_time: false }, pub, "Posted", "ok"],
  ["reworking", { status: "reworking", planned_at: future, needs_new_time: false }, pub, "Reworking…", "busy"],
  ["rejected", { status: "rejected", planned_at: future, needs_new_time: false }, pub, "Skipped", "muted"],
  ["failed", { status: "failed", planned_at: past, needs_new_time: false }, pub, "Didn't go out", "muted"],
  ["expired", { status: "expired", planned_at: past, needs_new_time: false }, pub, "Didn't go out", "muted"],
];

describe("postLabel", () => {
  it.each(rows)("%s", (_n, post, brand, text, tone) => {
    expect(postLabel(post, brand, now)).toEqual({ text, tone });
  });
});

describe("postLabel after a redo", () => {
  const pending = { status: "pending_approval", planned_at: future, needs_new_time: false };
  it("says a new version is waiting when the redo came back untouched", () => {
    expect(postLabel(pending, pub, now, { redone: true })).toEqual({ text: "New version · needs your OK", tone: "needs" });
  });
  it("still asks for a new time first", () => {
    expect(postLabel({ ...pending, needs_new_time: true }, pub, now, { redone: true })).toEqual({ text: "Pick a new time", tone: "needs" });
  });
  it("hints that a redo didn't work while nobody has touched the post since", () => {
    expect(postLabel(pending, pub, now, { redoFailed: true })).toEqual({ text: "Redo didn't work · needs your OK", tone: "needs" });
    expect(postLabel({ ...pending, needs_new_time: true }, pub, now, { redoFailed: true })).toEqual({ text: "Pick a new time", tone: "needs" });
    expect(postLabel({ ...pending, status: "approved" }, pub, now, { redoFailed: true })).toEqual({ text: "Scheduled", tone: "ok" });
  });
  it("ignores redone for other statuses and when not set", () => {
    expect(postLabel({ ...pending, status: "approved" }, pub, now, { redone: true })).toEqual({ text: "Scheduled", tone: "ok" });
    expect(postLabel(pending, pub, now, { redone: false })).toEqual({ text: "Needs your OK", tone: "needs" });
  });
});
