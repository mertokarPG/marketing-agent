import { describe, it, expect, beforeEach } from "vitest";
import { insertPost, type Db } from "@carepost/core";
import { createTestDb, seedTestBrand } from "@carepost/core/testing";
import { getRecentPostsTool } from "../../src/tools/recent-posts.js";

let db: Db;
let brand: string;
beforeEach(async () => {
  ({ db } = await createTestDb());
  brand = await seedTestBrand(db);
  for (const caption of ["Amazing AI results!", "Tips for better headshots"]) {
    await insertPost(db, { brand_id: brand, kind: "core", status: "published", planned_at: new Date(), caption,
      hashtags: ["#ai"], media: [{ storage_path: "x/0.png" }], prompt_ids: [], rationale: "" });
  }
});

describe("getRecentPostsTool", () => {
  it("returns formatted recent posts", async () => {
    const result = await getRecentPostsTool(db, brand, 5);
    expect(result).toContain("Amazing AI results!");
    expect(result).toContain("Tips for better headshots");
    expect(result).toContain("core · published");
  });
  it("handles no posts", async () => {
    const other = await seedTestBrand(db);
    expect(await getRecentPostsTool(db, other, 5)).toContain("No recent posts");
  });
  it("respects limit", async () => {
    await insertPost(db, { brand_id: brand, kind: "core", status: "published", planned_at: new Date(Date.now() + 60_000),
      caption: "Newest post", hashtags: [], media: [], prompt_ids: [], rationale: "" });
    const result = await getRecentPostsTool(db, brand, 1);
    expect(result).toContain("Newest post");
    expect(result).not.toContain("Amazing AI results!");
  });
});
