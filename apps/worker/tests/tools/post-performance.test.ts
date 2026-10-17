import { describe, it, expect, beforeEach } from "vitest";
import { insertPost, insertAnalytics, type Db } from "@carepost/core";
import { createTestDb, seedTestBrand } from "@carepost/core/testing";
import { getPostPerformanceTool } from "../../src/tools/post-performance.js";

let db: Db;
let brand: string;

beforeEach(async () => {
  ({ db } = await createTestDb());
  brand = await seedTestBrand(db);
  const postId = await insertPost(db, {
    brand_id: brand,
    kind: "core",
    status: "published",
    planned_at: new Date(),
    published_at: new Date(),
    caption: "Test post",
    hashtags: ["#test"],
    media: [{ storage_path: "x/0.png" }],
    prompt_ids: [],
    rationale: "",
  });
  await insertAnalytics(db, {
    post_id: postId,
    brand_id: brand,
    likes: 100,
    comments: 20,
    shares: 10,
    reach: 5000,
    impressions: 8000,
    views: 12000,
    saves: 34,
    profile_visits: 50,
    link_clicks: 15,
  });
});

describe("getPostPerformanceTool", () => {
  it("returns formatted performance data", async () => {
    const result = await getPostPerformanceTool(db, brand, 5);
    expect(result).toContain("100 likes");
    expect(result).toContain("5000 reach");
    expect(result).toContain("Test post");
  });

  it("returns message when no data", async () => {
    const other = await seedTestBrand(db);
    const result = await getPostPerformanceTool(db, other, 5);
    expect(result).toContain("No performance data");
  });
});
