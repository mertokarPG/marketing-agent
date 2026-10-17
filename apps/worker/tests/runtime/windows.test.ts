import { describe, it, expect } from "vitest";
import type { BrandConfig } from "@carepost/core";
import { runWindow, buildBrief } from "../../src/runtime/windows.js";

const brand = {
  name: "Kuanyin Skin", timezone: "Europe/Brussels",
  postingSchedule: { coreDays: ["mon", "tue", "wed", "thu", "fri"], defaultTime: "10:00" },
} as unknown as BrandConfig;

describe("runWindow", () => {
  it("weekly_plan covers the local ISO week", () => {
    const w = runWindow(brand, "weekly_plan", "2026-W43", new Date("2026-10-18T07:00:00Z"));
    expect(w.start.toISOString()).toBe("2026-10-18T22:00:00.000Z"); // Mon 00:00 CEST
    expect(w.end.toISOString()).toBe("2026-10-25T23:00:00.000Z");   // next Mon 00:00 CET (DST ended)
  });
  it("daily_check runs from now+2h to end of tomorrow", () => {
    const now = new Date("2026-10-19T06:00:00Z");
    const w = runWindow(brand, "daily_check", "2026-10-19", now);
    expect(w.start.toISOString()).toBe("2026-10-19T08:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-10-20T22:00:00.000Z");
  });
  it("manual allows the next 14 days", () => {
    const now = new Date("2026-10-19T06:00:00Z");
    const w = runWindow(brand, "manual", "m", now);
    expect(w.start.getTime() - now.getTime()).toBe(15 * 60_000);
    expect(w.end.getTime() - now.getTime()).toBe(14 * 86400_000);
  });
});

describe("buildBrief", () => {
  it("lists concrete local slots for the weekly plan as suggestions", () => {
    const brief = buildBrief(brand, "weekly_plan", "2026-W43", new Date("2026-10-18T07:00:00Z"));
    expect(brief).toContain("Mon 2026-10-19 10:00");
    expect(brief).toContain("Fri 2026-10-23 10:00");
    expect(brief).toContain("2026-10-19T08:00:00.000Z");
    expect(brief).toContain("save_post");
    expect(brief).toContain("about the listed time");
    expect(brief).toContain("within the same local day");
    expect(brief).not.toContain("exactly as listed");
  });
  it("tells the daily check to save at most one timely post", () => {
    const brief = buildBrief(brand, "daily_check", "2026-10-19", new Date("2026-10-19T06:00:00Z"));
    expect(brief).toMatch(/at most ONE timely post/);
    expect(brief).toContain("get_planned_posts");
  });
  it("uses the user brief for manual runs", () => {
    expect(buildBrief(brand, "manual", "m", new Date(), "Do X")).toContain("Do X");
  });
});
