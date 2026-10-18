import { describe, it, expect } from "vitest";
import { buildWeek, buildMonth, currentWeekStart } from "./week";

const tz = "Europe/Brussels";

describe("buildWeek", () => {
  it("week grid across the October DST change", () => {
    const posts = [
      { id: "sun", planned_at: "2026-10-25T01:30:00Z" },
      { id: "mon", planned_at: "2026-10-19T21:59:00Z" },
      { id: "tue", planned_at: "2026-10-19T22:00:00Z" },
      { id: "mon0", planned_at: "2026-10-19T06:00:00Z" },
    ];
    const days = buildWeek(posts, "2026-10-19", tz);
    expect(days).toHaveLength(7);
    expect(days[0].ymd).toBe("2026-10-19");
    expect(days[0].weekday).toBe("Mon");
    expect(days[0].dayNum).toBe(19);
    expect(days[6].ymd).toBe("2026-10-25");
    expect(days[6].posts.map((p) => p.id)).toEqual(["sun"]);
    expect(days[0].posts.map((p) => p.id)).toEqual(["mon0", "mon"]);
    expect(days[1].posts.map((p) => p.id)).toEqual(["tue"]);
  });
});

describe("currentWeekStart", () => {
  it("Sunday evening returns that week's Monday", () => {
    expect(currentWeekStart(new Date("2026-10-25T20:00:00Z"), tz)).toBe("2026-10-19");
  });
  it("Sunday 23:30 UTC is already Monday in Brussels", () => {
    expect(currentWeekStart(new Date("2026-10-25T23:30:00Z"), tz)).toBe("2026-10-26");
  });
});

describe("buildMonth", () => {
  it("returns a 6x7 grid starting on a Monday", () => {
    const days = buildMonth([{ id: "a", planned_at: "2026-10-31T10:00:00Z" }], "2026-10", tz);
    expect(days).toHaveLength(42);
    expect(days[0].ymd).toBe("2026-09-28");
    expect(days[0].weekday).toBe("Mon");
    expect(days[41].ymd).toBe("2026-11-08");
    expect(days.find((d) => d.ymd === "2026-10-31")!.posts).toHaveLength(1);
  });
});
