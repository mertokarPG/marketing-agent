import { describe, it, expect, beforeEach } from "vitest";
import { createDatabase } from "../../src/db/schema.js";
import { insertPost, insertAnalytics } from "../../src/db/queries.js";
import { getPostPerformanceTool } from "../../src/tools/post-performance.js";
import Database from "better-sqlite3";

let db: Database.Database;

beforeEach(() => {
  db = createDatabase(":memory:");
  const postId = insertPost(db, {
    brand_id: "carephoto",
    caption: "Test post",
    hashtags: ["#test"],
    content_theme: "before-after",
  });
  insertAnalytics(db, {
    post_id: postId,
    brand_id: "carephoto",
    likes: 100,
    comments: 20,
    shares: 10,
    reach: 5000,
    impressions: 8000,
    profile_visits: 50,
    link_clicks: 15,
  });
});

describe("getPostPerformanceTool", () => {
  it("returns formatted performance data", () => {
    const result = getPostPerformanceTool(db, "carephoto", 5);
    expect(result).toContain("100 likes");
    expect(result).toContain("5000 reach");
    expect(result).toContain("Test post");
  });

  it("returns message when no data", () => {
    const result = getPostPerformanceTool(db, "nonexistent", 5);
    expect(result).toContain("No performance data");
  });
});
