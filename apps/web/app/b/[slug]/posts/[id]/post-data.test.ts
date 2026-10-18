import { describe, it, expect } from "vitest";
import {
  parseCaption, joinCaption, parseTags, publishedLength, captionLimit, captionProblem, stepNav, postActions,
  goesOutLabel, formatChip, whenLabel, slideSheetTitle, previewCaption, lastChangedText, validLocalTime, isPastLocal, latestMetrics,
} from "./post-data";

describe("parseCaption / joinCaption", () => {
  it("splits trailing hashtags off and round-trips", () => {
    const text = "Same person, same light.\nSwipe to see.\n\n#portrait #aiphoto #carephoto";
    const parsed = parseCaption(text);
    expect(parsed).toEqual({ caption: "Same person, same light.\nSwipe to see.", hashtags: ["#portrait", "#aiphoto", "#carephoto"] });
    expect(joinCaption(parsed.caption, parsed.hashtags)).toBe(text);
  });

  it("handles a caption with no hashtags", () => {
    expect(parseCaption("Just words.\n")).toEqual({ caption: "Just words.", hashtags: [] });
    expect(joinCaption("Just words.", [])).toBe("Just words.");
  });

  it("keeps hashtags in the middle of the text (and on a text line) in the caption", () => {
    const text = "Shot with #carephoto in the studio.\nLove this #look";
    expect(parseCaption(text)).toEqual({ caption: text, hashtags: [] });
    const withTail = `${text}\n\n#a #b`;
    expect(parseCaption(withTail)).toEqual({ caption: text, hashtags: ["#a", "#b"] });
    expect(joinCaption(text, ["#a", "#b"])).toBe(withTail);
  });

  it("collects hashtags over several trailing lines and ignores blank lines", () => {
    expect(parseCaption("Hi\n#a\n#b  #c\n\n")).toEqual({ caption: "Hi", hashtags: ["#a", "#b", "#c"] });
  });

  it("joinCaption adds a missing # and drops empty tags", () => {
    expect(joinCaption("Hi", ["a", "#b", " "])).toBe("Hi\n\n#a #b");
  });

  it("parse(join(x)) is stable", () => {
    const c = "Line one\nLine two #inline";
    const h = ["#x", "#y"];
    expect(parseCaption(joinCaption(c, h))).toEqual({ caption: c, hashtags: h });
  });
});

describe("parseTags (the separate hashtags field)", () => {
  it("splits on spaces or commas and adds a missing #", () => {
    expect(parseTags("#a b  ,#c")).toEqual(["#a", "#b", "#c"]);
  });
  it("empty and lone # give no tags", () => {
    expect(parseTags("")).toEqual([]);
    expect(parseTags("  # ")).toEqual([]);
  });
  it("a stored caption is never re-split: its own hashtag lines stay in the caption", () => {
    // The editor keeps caption and hashtags as stored; only the hashtags field is parsed.
    expect(parseTags(["#x", "#y"].join(" "))).toEqual(["#x", "#y"]);
  });
});

describe("caption length (published length)", () => {
  it("counts caption + blank line + hashtags like the server", () => {
    expect(publishedLength("abc", [])).toBe(3);
    expect(publishedLength("abc", ["#a", "#bb"])).toBe(3 + 2 + 6);
  });
  it("captionLimit: ok below 2,000, warn from 2,000, over above 2,200", () => {
    expect(captionLimit(1999)).toBe("ok");
    expect(captionLimit(2000)).toBe("warn");
    expect(captionLimit(2200)).toBe("warn");
    expect(captionLimit(2201)).toBe("over");
  });
  it("captionProblem names what is wrong, in plain words", () => {
    expect(captionProblem("", ["#a"])).toBe("The caption can't be empty.");
    expect(captionProblem("hi", ["#1", "#2", "#3", "#4", "#5", "#6"])).toBe("Instagram allows up to 5 hashtags. Remove some.");
    expect(captionProblem("x".repeat(2200), ["#a"])).toBe("That caption is too long for Instagram. Please shorten it.");
    expect(captionProblem("fine", ["#a"])).toBeNull();
  });
});

describe("stepNav", () => {
  const ids = ["a", "b", "c"];
  it("first", () => expect(stepNav(ids, "a")).toEqual({ prev: null, next: "b", index: 0, total: 3 }));
  it("middle", () => expect(stepNav(ids, "b")).toEqual({ prev: "a", next: "c", index: 1, total: 3 }));
  it("last", () => expect(stepNav(ids, "c")).toEqual({ prev: "b", next: null, index: 2, total: 3 }));
  it("not in the list", () => expect(stepNav(ids, "z")).toEqual({ prev: null, next: null, index: -1, total: 3 }));
});

describe("postActions", () => {
  const now = new Date("2026-10-19T12:00:00Z");
  const future = "2026-10-20T08:00:00Z";
  const past = "2026-10-18T08:00:00Z";
  const review = { approval_mode: "review", status: "active" };
  const auto = { approval_mode: "autopilot", status: "active" };
  const post = (status: string, planned_at = future, needs_new_time = false) => ({ status, planned_at, needs_new_time });

  it("review mode, needs your OK: approve / save / skip, editable", () => {
    const a = postActions(post("pending_approval"), review, "owner", now);
    expect(a).toMatchObject({ kind: "review", editable: true, results: false, approveBlocked: null, note: null });
  });
  it("needs a new time: approve is blocked and the picker opens", () => {
    const a = postActions(post("pending_approval", future, true), review, "editor", now);
    expect(a.kind).toBe("review");
    expect(a.approveBlocked).toBe("The planned time has passed. Pick a new time.");
    expect(a.openTimePicker).toBe(true);
  });
  it("pending in the past: approve blocked", () => {
    expect(postActions(post("pending_approval", past), review, "owner", now).approveBlocked).toBe("The planned time has passed. Pick a new time.");
  });
  it("approved in review mode: Approved ✓ + Undo, still editable", () => {
    expect(postActions(post("approved"), review, "owner", now)).toMatchObject({ kind: "approved", editable: true, undo: true });
  });
  it("no Undo once the approved post's time has passed", () => {
    expect(postActions(post("approved", past), review, "owner", now)).toMatchObject({ kind: "approved", undo: false });
    expect(postActions(post("approved", "2026-10-19T12:00:00Z"), review, "owner", now).undo).toBe(false);
    expect(postActions(post("pending_approval"), review, "owner", now).undo).toBe(false);
  });
  it("autopilot approved: Keep / Pull this post", () => {
    expect(postActions(post("approved"), auto, "owner", now)).toMatchObject({ kind: "autopilot", editable: true });
  });
  it("autopilot post back from a redo needs review", () => {
    expect(postActions(post("pending_approval"), auto, "owner", now).kind).toBe("review");
  });
  it("viewer: read-only, no actions", () => {
    expect(postActions(post("pending_approval"), review, "viewer", now)).toMatchObject({ kind: "none", editable: false, note: null });
  });
  it("posted: results, read-only (for viewers too)", () => {
    expect(postActions(post("published", past), review, "owner", now)).toMatchObject({ kind: "none", editable: false, results: true });
    expect(postActions(post("published", past), review, "viewer", now).results).toBe(true);
  });
  it("publishing, skipped, failed, expired, reworking: read-only with a plain reason", () => {
    expect(postActions(post("publishing"), review, "owner", now)).toMatchObject({ kind: "none", editable: false, note: "This post is going out now." });
    expect(postActions(post("rejected"), review, "owner", now).note).toBe("This post was skipped, so it won't go out.");
    expect(postActions(post("failed", past), review, "owner", now).note).toBe("Instagram didn't accept this post, so it didn't go out.");
    expect(postActions(post("expired", past), review, "owner", now).note).toBe("This post wasn't approved before its time, so it didn't go out.");
    expect(postActions({ ...post("expired", past), publish_error: "missed publish window" }, review, "owner", now).note)
      .toBe("It was approved but couldn't go out in time.");
    expect(postActions({ ...post("expired", past), publish_error: null }, review, "owner", now).note)
      .toBe("This post wasn't approved before its time, so it didn't go out.");
    expect(postActions(post("reworking"), review, "owner", now)).toMatchObject({ kind: "none", editable: false, note: "The agent is reworking this post." });
  });
});

describe("formatting", () => {
  const tz = "Europe/Brussels";
  it("goesOutLabel in the brand timezone", () => {
    expect(goesOutLabel("2026-10-20T08:00:00Z", tz)).toBe("TUE 20 · 10:00");
  });
  it("formatChip", () => {
    expect(formatChip(1)).toBe("Single photo");
    expect(formatChip(5)).toBe("Carousel · 5 photos");
    expect(formatChip(0)).toBe("No photos yet");
    expect(formatChip(0, "published")).toBe("No photos saved");
    expect(formatChip(1, "published")).toBe("Single photo");
  });
  it("whenLabel says Went out once a post is out", () => {
    expect(whenLabel("published")).toBe("Went out");
    expect(whenLabel("pending_approval")).toBe("Goes out");
    expect(whenLabel("approved")).toBe("Goes out");
    expect(whenLabel("rejected")).toBe("Was planned for");
    expect(whenLabel("failed")).toBe("Was planned for");
    expect(whenLabel("expired")).toBe("Was planned for");
    expect(whenLabel("reworking")).toBe("Goes out");
  });
  it("slideSheetTitle for the current post and for an earlier version", () => {
    expect(slideSheetTitle(1, false)).toBe("The slide");
    expect(slideSheetTitle(5, false)).toBe("All 5 slides, in order");
    expect(slideSheetTitle(1, true)).toBe("Its slide");
    expect(slideSheetTitle(3, true)).toBe("Its 3 slides, in order");
  });
  it("previewCaption truncates at a word and flags it", () => {
    expect(previewCaption("short one", 20)).toEqual({ text: "short one", more: false });
    expect(previewCaption("Same person, same light, three models", 20)).toEqual({ text: "Same person, same…", more: true });
    expect(previewCaption("first line\nsecond line\nthird", 200)).toEqual({ text: "first line second line…", more: true });
  });
  it("lastChangedText names you, otherwise no name", () => {
    expect(lastChangedText({ by: "u1", at: "2026-10-18T12:05:00Z" }, "u1", tz)).toBe("Last changed by you, Sun 18 Oct at 14:05");
    expect(lastChangedText({ by: "u2", at: "2026-10-18T12:05:00Z" }, "u1", tz)).toBe("Last changed Sun 18 Oct at 14:05");
    expect(lastChangedText({ by: null, at: null }, "u1", tz)).toBeNull();
  });
});

describe("time picking", () => {
  it("validLocalTime accepts real dates and times only", () => {
    expect(validLocalTime("2026-10-20", "10:00")).toBe(true);
    expect(validLocalTime("2026-02-30", "10:00")).toBe(false);
    expect(validLocalTime("2026-10-20", "24:00")).toBe(false);
    expect(validLocalTime("20-10-2026", "10:00")).toBe(false);
    expect(validLocalTime("2026-10-20", "9:00")).toBe(false);
  });
  it("isPastLocal uses the brand timezone", () => {
    const now = new Date("2026-10-19T08:30:00Z"); // 10:30 in Brussels
    expect(isPastLocal("2026-10-19", "10:00", "Europe/Brussels", now)).toBe(true);
    expect(isPastLocal("2026-10-19", "11:00", "Europe/Brussels", now)).toBe(false);
  });
});

describe("latestMetrics", () => {
  it("picks the newest snapshot", () => {
    const m = latestMetrics([
      { reach: 1, saves: 0, shares: 0, likes: 0, comments: 0, measured_at: "2026-10-18T00:00:00Z" },
      { reach: 9, saves: 2, shares: 1, likes: 5, comments: 3, measured_at: "2026-10-19T00:00:00Z" },
    ]);
    expect(m?.reach).toBe(9);
    expect(latestMetrics([])).toBeNull();
  });
});
