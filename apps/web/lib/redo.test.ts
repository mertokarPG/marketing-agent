import { describe, it, expect } from "vitest";
import { isRedone, redoAvailability, latestRevisionState, reworkingText, reworkMinutes, versionLabel, REDO_MAX } from "./redo";

const now = new Date("2026-10-18T12:00:00Z");
const post = (over: Partial<{ status: string; planned_at: string; needs_new_time: boolean }> = {}) =>
  ({ status: "pending_approval", planned_at: "2026-10-20T10:00:00Z", needs_new_time: false, ...over });
const active = { status: "active" };

describe("redoAvailability", () => {
  it("is offered to owners and editors on an editable post", () => {
    expect(redoAvailability(post(), active, "owner", [], now)).toEqual({ show: true, allowed: true });
    expect(redoAvailability(post({ status: "approved" }), active, "editor", [], now)).toEqual({ show: true, allowed: true });
  });
  it("is hidden for viewers and for posts that can't change", () => {
    expect(redoAvailability(post(), active, "viewer", [], now)).toEqual({ show: false });
    for (const status of ["published", "publishing", "rejected", "failed", "expired", "reworking"]) {
      expect(redoAvailability(post({ status }), active, "owner", [], now)).toEqual({ show: false });
    }
  });
  it("says why when it is refused", () => {
    expect(redoAvailability(post({ planned_at: "2026-10-18T12:29:00Z" }), active, "owner", [], now))
      .toEqual({ show: true, allowed: false, reason: "Too close to posting time to rework. Edit it yourself or skip it." });
    expect(redoAvailability(post(), { status: "paused" }, "owner", [], now))
      .toEqual({ show: true, allowed: false, reason: "Posting is paused for this brand." });
    const used = [{ status: "done" }, { status: "done" }, { status: "queued" }];
    expect(redoAvailability(post(), active, "owner", used, now))
      .toEqual({ show: true, allowed: false, reason: "You've used the redos for this post. Edit it yourself or skip it." });
  });
  it("asks for a new time first when the time has passed or needs changing", () => {
    const reason = "Pick a new time first, then you can ask the agent.";
    expect(redoAvailability(post({ planned_at: "2026-10-18T11:00:00Z" }), active, "owner", [], now)).toEqual({ show: true, allowed: false, reason });
    expect(redoAvailability(post({ planned_at: "2026-10-18T12:00:00Z" }), active, "owner", [], now)).toEqual({ show: true, allowed: false, reason });
    expect(redoAvailability(post({ needs_new_time: true }), active, "owner", [], now)).toEqual({ show: true, allowed: false, reason });
  });
  it("doesn't count failed redos toward the limit", () => {
    const tries = [{ status: "done" }, { status: "failed" }, { status: "done" }, { status: "failed" }];
    expect(redoAvailability(post(), active, "owner", tries, now)).toEqual({ show: true, allowed: true });
  });
  it("allows exactly 30 minutes ahead", () => {
    expect(redoAvailability(post({ planned_at: "2026-10-18T12:30:00Z" }), active, "owner", [], now)).toEqual({ show: true, allowed: true });
  });
});

describe("latestRevisionState", () => {
  const loadedAt = "2026-10-18T12:00:00Z";
  const rev = (status: string, created_at: string, finished_at: string | null = null, feedback = "more playful") =>
    ({ status, created_at, finished_at, feedback });

  it("shows the feedback of the redo in progress while reworking", () => {
    const revs = [rev("done", "2026-10-17T09:00:00Z", "2026-10-17T09:02:00Z", "old"), rev("running", "2026-10-18T11:59:00Z")];
    expect(latestRevisionState("reworking", revs, loadedAt)).toEqual({ kind: "reworking", feedback: "more playful" });
  });
  it("reports a failure that happened after the page loaded", () => {
    expect(latestRevisionState("pending_approval", [rev("failed", "2026-10-18T11:59:00Z", "2026-10-18T12:03:00Z")], loadedAt))
      .toEqual({ kind: "failed" });
  });
  it("stays quiet about an older failure, or when the latest redo worked", () => {
    expect(latestRevisionState("pending_approval", [rev("failed", "2026-10-18T10:00:00Z", "2026-10-18T10:02:00Z")], loadedAt))
      .toEqual({ kind: "none" });
    expect(latestRevisionState("pending_approval", [
      rev("failed", "2026-10-18T12:01:00Z", "2026-10-18T12:02:00Z"),
      rev("done", "2026-10-18T12:05:00Z", "2026-10-18T12:07:00Z"),
    ], loadedAt)).toEqual({ kind: "none" });
    expect(latestRevisionState("pending_approval", [], loadedAt)).toEqual({ kind: "none" });
  });
  it("still says reworking when the redo row isn't readable yet", () => {
    expect(latestRevisionState("reworking", [], loadedAt)).toEqual({ kind: "reworking", feedback: null });
  });
});

describe("reworking copy", () => {
  it("estimates 4 minutes when new images are made, else 2", () => {
    expect(reworkMinutes({ enabled: true })).toBe(4);
    expect(reworkMinutes({ enabled: false })).toBe(2);
    expect(reworkMinutes(null)).toBe(2);
  });
  it("quotes the feedback", () => {
    expect(reworkingText("more playful", 2)).toBe("Reworking: 'more playful'… about 2 minutes");
    expect(reworkingText(null, 4)).toBe("Reworking… about 4 minutes");
  });
  it("shortens long feedback when asked", () => {
    const long = "make it much more playful and use the rose oil photo first please";
    expect(reworkingText(long, 2, 20)).toBe("Reworking: 'make it much more…'… about 2 minutes");
  });
  it("caps typed feedback at 500 characters", () => {
    expect(REDO_MAX).toBe(500);
  });
});

describe("versionLabel", () => {
  it("names when and why the version was kept", () => {
    expect(versionLabel({ created_at: "2026-10-18T12:05:00Z", reason: "redo", feedback: "more playful" }, "Europe/Brussels"))
      .toBe("Version from Sun 18 Oct at 14:05, before redo: 'more playful'");
    expect(versionLabel({ created_at: "2026-10-18T12:05:00Z", reason: "restore", feedback: null }, "Europe/Brussels"))
      .toBe("Version from Sun 18 Oct at 14:05, before restoring");
  });
});

describe("isRedone", () => {
  const rev = (status: string, created_at: string, finished_at: string | null) => ({ status, created_at, finished_at, feedback: "x" });
  const p = (last_changed_at: string | null, status = "pending_approval") => ({ status, last_changed_at });
  it("is true when the latest redo came back and nobody changed the post since", () => {
    expect(isRedone(p("2026-10-18T12:02:00Z"), [rev("done", "2026-10-18T12:00:00Z", "2026-10-18T12:02:00Z")])).toBe(true);
  });
  it("is false once the post was changed after the redo returned", () => {
    expect(isRedone(p("2026-10-18T12:05:00Z"), [rev("done", "2026-10-18T12:00:00Z", "2026-10-18T12:02:00Z")])).toBe(false);
  });
  it("is false when the latest redo failed, there is none, or the post isn't waiting", () => {
    expect(isRedone(p("2026-10-18T12:02:00Z"), [
      rev("done", "2026-10-18T11:00:00Z", "2026-10-18T12:02:00Z"),
      rev("failed", "2026-10-18T12:01:00Z", "2026-10-18T12:02:00Z"),
    ])).toBe(false);
    expect(isRedone(p("2026-10-18T12:02:00Z"), [])).toBe(false);
    expect(isRedone(p("2026-10-18T12:02:00Z", "approved"), [rev("done", "2026-10-18T12:00:00Z", "2026-10-18T12:02:00Z")])).toBe(false);
  });
  it("treats a post with no recorded change as untouched", () => {
    expect(isRedone(p(null), [rev("done", "2026-10-18T12:00:00Z", "2026-10-18T12:02:00Z")])).toBe(true);
  });
});
