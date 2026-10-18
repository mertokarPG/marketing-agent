import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStorage, listInsights, type BrandConfig, type Db } from "@carepost/core";
import { createTestDb, seedTestBrand } from "@carepost/core/testing";
import { saveLearnings } from "../src/tools/save-learnings.js";
import type { ToolContext } from "../src/runtime/types.js";

let db: Db;
let brand: BrandConfig;
const ctx = (o: Partial<ToolContext> = {}): ToolContext => ({
  storage: new MemoryStorage(), runId: null, kind: "weekly_plan", periodKey: "2026-W43",
  window: { start: new Date(), end: new Date(Date.now() + 86400_000) }, notify: async () => "", ...o,
});

beforeEach(async () => {
  ({ db } = await createTestDb());
  brand = { dbId: await seedTestBrand(db), name: "K" } as unknown as BrandConfig;
});

describe("save_learnings", () => {
  it("save_learnings writes one insight per week", async () => {
    expect(await saveLearnings(db, brand, ctx(), { learnings: ["Carousels got 2x saves", "Morning posts did better"] }))
      .toMatch(/Saved 2 learnings/);
    await saveLearnings(db, brand, ctx(), { learnings: ["Replaced one", "Replaced two", "Replaced three"] });
    await saveLearnings(db, brand, ctx({ periodKey: "2026-W44" }), { learnings: ["Next week a", "Next week b"] });

    const rows = await db.query<any>("select week_key, body from brand_insights where brand_id = $1 order by week_key", [brand.dbId]);
    expect(rows).toEqual([
      { week_key: "2026-W43", body: "Replaced one\nReplaced two\nReplaced three" },
      { week_key: "2026-W44", body: "Next week a\nNext week b" },
    ]);
    const latest = await listInsights(db, brand.dbId, 1);
    expect(latest).toHaveLength(1);
    expect(latest[0]).toMatchObject({ week_key: "2026-W44" });
  });

  it("rejects the wrong number or overlong learnings, and non-weekly runs", async () => {
    expect(await saveLearnings(db, brand, ctx(), { learnings: ["only one"] })).toMatch(/rejected/);
    expect(await saveLearnings(db, brand, ctx(), { learnings: ["a", "b", "c", "d"] })).toMatch(/rejected/);
    expect(await saveLearnings(db, brand, ctx(), { learnings: ["a", "x".repeat(201)] })).toMatch(/rejected/);
    expect(await saveLearnings(db, brand, ctx({ kind: "daily_check" }), { learnings: ["a", "b"] })).toMatch(/rejected/);
    expect(await listInsights(db, brand.dbId, 10)).toHaveLength(0);
  });
});
