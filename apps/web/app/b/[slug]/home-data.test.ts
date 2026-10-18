import { describe, it, expect } from "vitest";
import { waitingPosts, homeLede, firstGoesOut, showsNeedsYou, needsYouPosts, needsYouFirstLine, postTitle, weekRangeLabel, resolveWeek, summarizeResults, hasHomeResults, HOME_RESULTS_EMPTY } from "./home-data";

const now = new Date("2026-10-19T12:00:00Z");
const p = (id: string, status: string, planned_at: string, needs_new_time = false) => ({ id, status, planned_at, needs_new_time, caption: "" });

describe("waitingPosts", () => {
  it("keeps pending future posts sorted, drops reworking/past/approved", () => {
    const out = waitingPosts([
      p("c", "pending_approval", "2026-10-24T08:00:00Z"),
      p("a", "pending_approval", "2026-10-20T08:00:00Z"),
      p("r", "reworking", "2026-10-21T08:00:00Z"),
      p("old", "pending_approval", "2026-10-18T08:00:00Z"),
      p("ok", "approved", "2026-10-22T08:00:00Z"),
    ], now);
    expect(out.map((x) => x.id)).toEqual(["a", "c"]);
  });
  it("keeps posts that need a new time, past or not, and lists them first", () => {
    const out = waitingPosts([
      p("c", "pending_approval", "2026-10-24T08:00:00Z"),
      p("late", "pending_approval", "2026-10-18T08:00:00Z", true),
      p("a", "pending_approval", "2026-10-20T08:00:00Z"),
      p("soon", "pending_approval", "2026-10-21T08:00:00Z", true),
      p("old", "pending_approval", "2026-10-17T08:00:00Z"),
    ], now);
    expect(out.map((x) => x.id)).toEqual(["late", "soon", "a", "c"]);
  });
});

describe("needsYouFirstLine", () => {
  const tz = "Europe/Brussels";
  it("says when the first one goes out", () => {
    expect(needsYouFirstLine([p("a", "pending_approval", "2026-10-20T08:00:00Z")], tz))
      .toEqual({ before: "The first one goes out ", strong: "Tuesday at 10:00", after: ". Take a look, tweak the caption if you like, and approve." });
  });
  it("leads with posts that need a new time", () => {
    expect(needsYouFirstLine([p("late", "pending_approval", "2026-10-18T08:00:00Z", true), p("a", "pending_approval", "2026-10-20T08:00:00Z")], tz))
      .toEqual({ before: "", strong: "One post needs a new time.", after: " Pick one, take a look, and approve." });
    expect(needsYouFirstLine([p("x", "pending_approval", "2026-10-18T08:00:00Z", true), p("y", "pending_approval", "2026-10-18T09:00:00Z", true)], tz))
      .toEqual({ before: "", strong: "2 posts need a new time.", after: " Pick one for each, take a look, and approve." });
  });
});

describe("homeLede", () => {
  const b = { status: "active", publisher: "postiz", approval_mode: "review" };
  it("paused", () => expect(homeLede({ ...b, status: "paused" }, 3, true)).toBe("Carepost is paused for this brand. Nothing will be planned or posted."));
  it("empty week", () => expect(homeLede(b, 0, false)).toBe("Your first plan arrives Sunday morning."));
  it("review with waiting", () => {
    expect(homeLede(b, 3, true)).toBe("Your Instagram is planned for the week. 3 posts are waiting for your OK; nothing goes out without it.");
    expect(homeLede(b, 1, true)).toBe("Your Instagram is planned for the week. 1 post is waiting for your OK; nothing goes out without it.");
  });
  it("nothing waiting", () => expect(homeLede(b, 0, true)).toBe("Your Instagram is planned for the week. Nothing is waiting for your OK."));
  it("homeLede for an autopilot brand", () => expect(homeLede({ ...b, approval_mode: "autopilot" }, 0, true)).toBe("Your Instagram is planned for the week and goes out on its own."));
  it("homeLede for an autopilot brand with a redone post back", () => {
    expect(homeLede({ ...b, approval_mode: "autopilot" }, 1, true)).toBe("A post you asked to redo is back and needs your OK.");
    expect(homeLede({ ...b, approval_mode: "autopilot" }, 2, true)).toBe("Posts you asked to redo are back and need your OK.");
  });
  it("no publisher", () => expect(homeLede({ ...b, publisher: null }, 2, true)).toBe("Your Instagram is planned for the week. Nothing goes out until Instagram is connected."));
});

describe("showsNeedsYou / needsYouPosts", () => {
  const b = { approval_mode: "review", status: "active" };
  const auto = { ...b, approval_mode: "autopilot" };
  const plain = p("a", "pending_approval", "2026-10-20T08:00:00Z");
  const redoneOne = p("r", "pending_approval", "2026-10-21T08:00:00Z");
  const late = p("late", "pending_approval", "2026-10-18T08:00:00Z", true);
  it("review brand with waiting posts", () => expect(showsNeedsYou(b, [plain], {})).toBe(true));
  it("hidden when nothing waiting", () => expect(showsNeedsYou(b, [], {})).toBe(false));
  it("hidden for autopilot when nothing came back from a redo or needs a new time", () => {
    expect(showsNeedsYou(auto, [plain], {})).toBe(false);
    expect(needsYouPosts(auto, [plain], {})).toEqual([]);
  });
  it("shown for autopilot with only the redone posts and the ones needing a new time", () => {
    expect(showsNeedsYou(auto, [plain, redoneOne], { r: true })).toBe(true);
    expect(needsYouPosts(auto, [late, plain, redoneOne], { r: true }).map((x) => x.id)).toEqual(["late", "r"]);
  });
  it("review brands list every waiting post", () => expect(needsYouPosts(b, [late, plain], {}).map((x) => x.id)).toEqual(["late", "a"]));
  it("hidden when paused", () => {
    expect(showsNeedsYou({ ...b, status: "paused" }, [plain], {})).toBe(false);
    expect(showsNeedsYou({ ...auto, status: "paused" }, [redoneOne], { r: true })).toBe(false);
  });
});

describe("helpers", () => {
  it("resolveWeek rejects out-of-range years", () => expect(resolveWeek("9999-12-27", "2026-10-19")).toBe("2026-10-19"));
  it("firstGoesOut", () => expect(firstGoesOut("2026-10-20T08:00:00Z", "Europe/Brussels")).toEqual({ day: "Tuesday", time: "10:00" }));
  it("postTitle", () => {
    expect(postTitle("Studio portraits, shot on film.\nMore here", 4)).toBe("Studio portraits, shot on");
    expect(postTitle("", 4)).toBe("New post");
  });
  it("weekRangeLabel", () => {
    expect(weekRangeLabel("2026-10-19")).toBe("Oct 19 – 25");
    expect(weekRangeLabel("2026-10-26")).toBe("Oct 26 – Nov 1");
  });
  it("resolveWeek falls back on junk", () => {
    expect(resolveWeek("2026-10-21", "2026-10-19")).toBe("2026-10-19");
    expect(resolveWeek("nope", "2026-10-19")).toBe("2026-10-19");
    expect(resolveWeek("2026-10-26", "2026-10-19")).toBe("2026-10-26");
  });
});

describe("summarizeResults", () => {
  const posts = [
    { id: "a", planned_at: "2026-10-17T08:00:00Z", caption: "A" },
    { id: "b", planned_at: "2026-10-15T08:00:00Z", caption: "B" },
    { id: "c", planned_at: "2026-10-08T08:00:00Z", caption: "C" },
  ];
  const m = [
    { post_id: "a", reach: 100, measured_at: "2026-10-18T00:00:00Z" },
    { post_id: "a", reach: 40, measured_at: "2026-10-17T12:00:00Z" },
    { post_id: "b", reach: 60, measured_at: "2026-10-18T00:00:00Z" },
    { post_id: "c", reach: 80, measured_at: "2026-10-18T00:00:00Z" },
  ];
  it("sums latest reach, change and best", () => {
    const r = summarizeResults(posts, m, now);
    expect(r.reach).toBe(160);
    expect(r.changePct).toBe(100);
    expect(r.best?.id).toBe("a");
  });
  it("no data", () => {
    const r = summarizeResults([], [], now);
    expect(r).toEqual({ reach: null, changePct: null, best: null });
  });
});

describe("hasHomeResults", () => {
  it("is false when there is no reach, change or best post", () => {
    expect(hasHomeResults({ reach: null, changePct: null, best: null })).toBe(false);
    expect(HOME_RESULTS_EMPTY).toBe("Results show up here once your posts go out and Instagram shares the numbers.");
  });
  it("is true as soon as any number exists", () => {
    expect(hasHomeResults({ reach: 0, changePct: null, best: null })).toBe(true);
    expect(hasHomeResults({ reach: null, changePct: 5, best: null })).toBe(true);
    expect(hasHomeResults({ reach: null, changePct: null, best: { id: "p" } })).toBe(true);
  });
});
