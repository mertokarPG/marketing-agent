import { describe, it, expect } from "vitest";
import { latestMetricsPerPost, windowTotals, changePct, bestPosts, weeklyReach, firstSentence, resolveMonth, monthLabel } from "./results-data";

const m = (post_id: string, reach: number, saves: number, shares: number, measured_at: string) => ({ post_id, reach, saves, shares, measured_at });
const post = (id: string, planned_at: string, rationale = "") => ({ id, planned_at, caption: id, rationale });

describe("latestMetricsPerPost", () => {
  it("keeps only the newest snapshot per post", () => {
    const l = latestMetricsPerPost([m("a", 10, 0, 0, "2026-10-01T00:00:00Z"), m("a", 50, 0, 0, "2026-10-03T00:00:00Z"), m("a", 30, 0, 0, "2026-10-02T00:00:00Z"), m("b", 5, 0, 0, "2026-10-01T00:00:00Z")]);
    expect(l.get("a")?.reach).toBe(50);
    expect(l.get("b")?.reach).toBe(5);
  });
});

describe("windowTotals", () => {
  const posts = [post("a", "2026-10-05T10:00:00Z"), post("b", "2026-10-07T10:00:00Z"), post("c", "2026-09-01T10:00:00Z")];
  const metrics = [m("a", 10, 1, 1, "2026-10-06T00:00:00Z"), m("a", 100, 4, 2, "2026-10-08T00:00:00Z"), m("b", 20, 3, 0, "2026-10-08T00:00:00Z"), m("c", 999, 9, 9, "2026-10-08T00:00:00Z")];
  it("counts only the latest snapshot per post inside the window", () => {
    expect(windowTotals(metrics, posts, new Date("2026-10-05T00:00:00Z"), new Date("2026-10-12T00:00:00Z"))).toEqual({ reach: 120, savesShares: 9 });
  });
  it("is zero when nothing is in the window", () => {
    expect(windowTotals(metrics, posts, new Date("2026-01-01T00:00:00Z"), new Date("2026-01-08T00:00:00Z"))).toEqual({ reach: 0, savesShares: 0 });
  });
});

describe("changePct", () => {
  it("rounds the percentage change", () => { expect(changePct(150, 100)).toBe(50); expect(changePct(50, 100)).toBe(-50); expect(changePct(1, 3)).toBe(-67); });
  it("is null when the previous value is 0", () => { expect(changePct(5, 0)).toBeNull(); expect(changePct(0, 0)).toBeNull(); });
});

describe("bestPosts", () => {
  const posts = [post("a", "2026-10-05T10:00:00Z"), post("b", "2026-10-06T10:00:00Z"), post("c", "2026-10-07T10:00:00Z"), post("d", "2026-10-08T10:00:00Z"), post("e", "2026-10-09T10:00:00Z")];
  const metrics = [m("a", 100, 1, 0, "2026-10-10T00:00:00Z"), m("b", 100, 5, 0, "2026-10-10T00:00:00Z"), m("c", 300, 0, 0, "2026-10-10T00:00:00Z"), m("d", 10, 0, 0, "2026-10-10T00:00:00Z")];
  const from = new Date("2026-10-01T00:00:00Z"), to = new Date("2026-10-31T00:00:00Z");
  it("ranks by reach, tie by saves, top 3, skipping posts without metrics", () => {
    const b = bestPosts(posts, metrics, from, to);
    expect(b.map((x) => x.post.id)).toEqual(["c", "b", "a"]);
    expect(b[0]).toMatchObject({ reach: 300, saves: 0 });
  });
  it("respects n and the window", () => {
    expect(bestPosts(posts, metrics, from, to, 1)).toHaveLength(1);
    expect(bestPosts(posts, metrics, new Date("2026-10-08T00:00:00Z"), to).map((x) => x.post.id)).toEqual(["d"]);
  });
  it("uses the latest snapshot only", () => {
    const b = bestPosts([post("a", "2026-10-05T10:00:00Z")], [m("a", 500, 0, 0, "2026-10-06T00:00:00Z"), m("a", 40, 0, 0, "2026-10-09T00:00:00Z")], from, to);
    expect(b[0].reach).toBe(40);
  });
});

describe("weeklyReach", () => {
  const now = new Date("2026-10-18T12:00:00Z"); // Sunday; week starts Mon 2026-10-12
  it("returns 13 weeks oldest first ending with the current week, zero-filled", () => {
    const w = weeklyReach([post("a", "2026-10-13T10:00:00Z"), post("b", "2026-10-14T10:00:00Z"), post("o", "2026-10-06T10:00:00Z")], [m("a", 10, 0, 0, "2026-10-15T00:00:00Z"), m("a", 40, 0, 0, "2026-10-16T00:00:00Z"), m("b", 5, 0, 0, "2026-10-16T00:00:00Z"), m("o", 7, 0, 0, "2026-10-16T00:00:00Z")], now, "Europe/Brussels");
    expect(w).toHaveLength(13);
    expect(w[12]).toEqual({ weekStart: "2026-10-12", reach: 45 });
    expect(w[11]).toEqual({ weekStart: "2026-10-05", reach: 7 });
    expect(w[0].weekStart).toBe("2026-07-20");
    expect(w[0].reach).toBe(0);
  });
  it("ignores posts older than the 13 weeks", () => {
    const w = weeklyReach([post("x", "2026-01-01T10:00:00Z")], [m("x", 9, 0, 0, "2026-01-02T00:00:00Z")], now, "Europe/Brussels");
    expect(w.every((x) => x.reach === 0)).toBe(true);
  });
});

describe("firstSentence", () => {
  it("takes the first sentence", () => { expect(firstSentence("Shows the before and after. People love it.")).toBe("Shows the before and after."); });
  it("handles no punctuation and empty", () => { expect(firstSentence("Just words")).toBe("Just words"); expect(firstSentence("  ")).toBe(""); });
});

describe("resolveMonth", () => {
  it("accepts a valid month", () => { expect(resolveMonth("2026-11", "2026-10")).toBe("2026-11"); });
  it("falls back on garbage and out-of-range", () => {
    for (const g of [undefined, "", "abc", "2026-13", "2026-00", "1999-01", "2101-01", "2026-1", "2026-10-01"]) expect(resolveMonth(g, "2026-10")).toBe("2026-10");
  });
});

describe("monthLabel", () => { it("names the month", () => { expect(monthLabel("2026-10")).toBe("October 2026"); }); });
