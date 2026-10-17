import { describe, it, expect } from "vitest";
import { localParts, zonedTimeToUtc, addDaysYmd, isoWeekKey, mondayOfIsoWeek, formatLocal, coreSlots } from "../src/time.js";

const BXL = "Europe/Brussels";

describe("zonedTimeToUtc", () => {
  it("handles CET and CEST around the March 2026 switch", () => {
    expect(zonedTimeToUtc("2026-03-22", "09:00", BXL).toISOString()).toBe("2026-03-22T08:00:00.000Z");
    expect(zonedTimeToUtc("2026-03-29", "09:00", BXL).toISOString()).toBe("2026-03-29T07:00:00.000Z");
  });
  it("handles the October 2026 switch back", () => {
    expect(zonedTimeToUtc("2026-10-18", "09:00", BXL).toISOString()).toBe("2026-10-18T07:00:00.000Z");
    expect(zonedTimeToUtc("2026-10-25", "09:00", BXL).toISOString()).toBe("2026-10-25T08:00:00.000Z");
  });
  it("round-trips through localParts", () => {
    const at = zonedTimeToUtc("2026-10-19", "10:00", BXL);
    expect(localParts(at, BXL)).toMatchObject({ ymd: "2026-10-19", hour: 10, minute: 0, weekday: "mon" });
  });
});

describe("ISO weeks", () => {
  it("computes keys", () => {
    expect(isoWeekKey("2026-10-19")).toBe("2026-W43");
    expect(isoWeekKey("2026-01-01")).toBe("2026-W01");
    expect(isoWeekKey("2027-01-01")).toBe("2026-W53");
    expect(isoWeekKey("2026-03-30")).toBe("2026-W14");
  });
  it("finds the Monday of a week", () => {
    expect(mondayOfIsoWeek("2026-W43")).toBe("2026-10-19");
    expect(mondayOfIsoWeek("2026-W01")).toBe("2025-12-29");
    expect(() => mondayOfIsoWeek("2026-43")).toThrow();
  });
  it("adds days across month ends", () => {
    expect(addDaysYmd("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysYmd("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("coreSlots", () => {
  it("returns 5 weekday slots at local 10:00 across the DST week", () => {
    const slots = coreSlots("2026-W44", ["mon", "tue", "wed", "thu", "fri"], "10:00", BXL);
    expect(slots.map((s) => s.ymd)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"]);
    expect(slots[0].at.toISOString()).toBe("2026-10-26T09:00:00.000Z");
    expect(formatLocal(slots[0].at, BXL)).toBe("Mon 2026-10-26 10:00");
  });
});

describe("DST edge cases", () => {
  it("resolves an ambiguous fall-back time to the earlier instant", () => {
    // 02:30 on 2026-10-25 occurs twice (00:30Z CEST and 01:30Z CET).
    expect(zonedTimeToUtc("2026-10-25", "02:30", BXL).toISOString()).toBe("2026-10-25T00:30:00.000Z");
  });
  it("shifts a nonexistent spring-forward time past the gap", () => {
    // 02:30 on 2026-03-29 does not exist; shifted forward to 03:30 CEST.
    expect(zonedTimeToUtc("2026-03-29", "02:30", BXL).toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });
  it("keeps 08:00 and 09:00 local on the switch days", () => {
    for (const ymd of ["2026-03-29", "2026-10-25"]) {
      for (const hhmm of ["08:00", "09:00", "10:00"]) {
        const p = localParts(zonedTimeToUtc(ymd, hhmm, BXL), BXL);
        expect(`${p.ymd} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`).toBe(`${ymd} ${hhmm}`);
      }
    }
  });
});
