import { describe, it, expect } from "vitest";
import { waitingPosts, homeLede, firstGoesOut, showsNeedsYou, postTitle, weekRangeLabel, resolveWeek, summarizeResults } from "./home-data";

const now = new Date("2026-10-19T12:00:00Z");
const p = (id: string, status: string, planned_at: string) => ({ id, status, planned_at, caption: "" });

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
});

describe("homeLede", () => {
  const b = { status: "active", publisher: "postiz", approval_mode: "manual" };
  it("paused", () => expect(homeLede({ ...b, status: "paused" }, 3, true)).toBe("Carepost is paused for this brand. Nothing will be planned or posted."));
  it("empty week", () => expect(homeLede(b, 0, false)).toBe("Your first plan arrives Sunday morning."));
  it("review with waiting", () => {
    expect(homeLede(b, 3, true)).toBe("Your Instagram is planned for the week. 3 posts are waiting for your OK; nothing goes out without it.");
    expect(homeLede(b, 1, true)).toBe("Your Instagram is planned for the week. 1 post is waiting for your OK; nothing goes out without it.");
  });
  it("nothing waiting", () => expect(homeLede(b, 0, true)).toBe("Your Instagram is planned for the week. Nothing is waiting for your OK."));
  it("homeLede for an autopilot brand", () => expect(homeLede({ ...b, approval_mode: "autopilot" }, 0, true)).toBe("Your Instagram is planned for the week and goes out on its own."));
  it("no publisher", () => expect(homeLede({ ...b, publisher: null }, 2, true)).toBe("Your Instagram is planned for the week. Nothing goes out until Instagram is connected."));
});

describe("showsNeedsYou", () => {
  const b = { approval_mode: "review", status: "active" };
  it("review brand with waiting posts", () => expect(showsNeedsYou(b, 2)).toBe(true));
  it("hidden when nothing waiting", () => expect(showsNeedsYou(b, 0)).toBe(false));
  it("hidden for autopilot", () => expect(showsNeedsYou({ ...b, approval_mode: "autopilot" }, 2)).toBe(false));
  it("hidden when paused", () => expect(showsNeedsYou({ ...b, status: "paused" }, 2)).toBe(false));
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
