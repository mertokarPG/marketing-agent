import { describe, it, expect, vi, afterEach } from "vitest";
import { createTestDb, seedTestBrand } from "@carepost/core/testing";
import { dueRuns, schedulerTick } from "../../src/runtime/scheduler.js";

const BXL = "Europe/Brussels";
const at = (s: string) => new Date(s);

describe("dueRuns", () => {
  it("fires weekly + daily on Sunday morning (CEST)", () => {
    expect(dueRuns(at("2026-10-18T07:30:00Z"), BXL)).toEqual([
      { kind: "daily_check", periodKey: "2026-10-18" },
      { kind: "weekly_plan", periodKey: "2026-W43" },
    ]);
  });
  it("fires nothing before 08:00 local", () => {
    expect(dueRuns(at("2026-10-18T05:00:00Z"), BXL)).toEqual([]);
  });
  it("skips runs more than 6h late", () => {
    expect(dueRuns(at("2026-10-18T13:30:00Z"), BXL)).toEqual([]);
  });
  it("uses local time on the March DST day", () => {
    expect(dueRuns(at("2026-03-29T05:59:00Z"), BXL)).toEqual([]);
    expect(dueRuns(at("2026-03-29T06:00:00Z"), BXL)).toEqual([{ kind: "daily_check", periodKey: "2026-03-29" }]);
    expect(dueRuns(at("2026-03-29T06:30:00Z"), BXL)).toEqual([{ kind: "daily_check", periodKey: "2026-03-29" }]);
    expect(dueRuns(at("2026-03-29T07:05:00Z"), BXL)).toEqual([
      { kind: "daily_check", periodKey: "2026-03-29" },
      { kind: "weekly_plan", periodKey: "2026-W14" },
    ]);
  });
  it("uses local time on the October DST day", () => {
    expect(dueRuns(at("2026-10-25T06:59:00Z"), BXL)).toEqual([]);
    expect(dueRuns(at("2026-10-25T07:00:00Z"), BXL)).toEqual([{ kind: "daily_check", periodKey: "2026-10-25" }]);
    expect(dueRuns(at("2026-10-25T07:30:00Z"), BXL)).toEqual([{ kind: "daily_check", periodKey: "2026-10-25" }]);
    expect(dueRuns(at("2026-10-25T08:00:00Z"), BXL)).toEqual([
      { kind: "daily_check", periodKey: "2026-10-25" },
      { kind: "weekly_plan", periodKey: "2026-W44" },
    ]);
    expect(dueRuns(at("2026-10-25T08:05:00Z"), BXL)).toEqual([
      { kind: "daily_check", periodKey: "2026-10-25" },
      { kind: "weekly_plan", periodKey: "2026-W44" },
    ]);
  });
  it("only fires the daily check on weekdays", () => {
    expect(dueRuns(at("2026-10-19T06:10:00Z"), BXL)).toEqual([{ kind: "daily_check", periodKey: "2026-10-19" }]);
  });
});

describe("schedulerTick", () => {
  afterEach(() => vi.restoreAllMocks());

  it("is idempotent and skips paused brands", async () => {
    const { db } = await createTestDb();
    await seedTestBrand(db);
    await seedTestBrand(db, { status: "paused" });
    const now = at("2026-10-18T07:30:00Z");
    expect(await schedulerTick(db, now, new Set())).toBe(2);
    expect(await schedulerTick(db, now, new Set())).toBe(0);
    const [{ n }] = await db.query("select count(*)::int as n from agent_runs");
    expect(n).toBe(2);
  });

  it("logs a run skipped for lateness once across consecutive ticks, and does not enqueue it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { db } = await createTestDb();
    const brandId = await seedTestBrand(db, { slug: "late-brand" });
    const seen = new Set<string>();
    // Sunday 15:30 CEST: daily (08:00) is 7.5h late, weekly (09:00) is 6.5h late.
    expect(await schedulerTick(db, at("2026-10-18T13:30:00Z"), seen)).toBe(0);
    expect(await schedulerTick(db, at("2026-10-18T13:31:00Z"), seen)).toBe(0);
    const msgs = warn.mock.calls.map((c) => String(c[0]));
    expect(msgs).toHaveLength(2);
    expect(msgs.some((m) => m.includes("daily_check") && m.includes("2026-10-18") && m.includes("late-brand") && m.includes(brandId) && m.includes("7.5h"))).toBe(true);
    expect(msgs.some((m) => m.includes("weekly_plan") && m.includes("2026-W43") && m.includes("6.5h"))).toBe(true);
    const [{ n }] = await db.query("select count(*)::int as n from agent_runs");
    expect(n).toBe(0);
  });

  it("enqueues a within-window run without logging, and does not log already-run past occurrences", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { db } = await createTestDb();
    const brandId = await seedTestBrand(db);
    await db.query("insert into agent_runs (brand_id, kind, period_key) values ($1, 'weekly_plan', '2026-W43')", [brandId]);
    const seen = new Set<string>();
    expect(await schedulerTick(db, at("2026-10-19T06:10:00Z"), seen)).toBe(1);
    expect(warn).not.toHaveBeenCalled();
    // Later that day the daily run is past its window but was enqueued: no skip log.
    expect(await schedulerTick(db, at("2026-10-19T15:00:00Z"), seen)).toBe(0);
    expect(warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes("daily_check"))).toHaveLength(0);
  });
});
