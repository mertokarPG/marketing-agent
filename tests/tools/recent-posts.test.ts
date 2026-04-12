import { describe, it, expect, beforeEach } from "vitest";
import { createDatabase } from "../../src/db/schema.js";
import { insertPost } from "../../src/db/queries.js";
import { getRecentPostsTool } from "../../src/tools/recent-posts.js";
import Database from "better-sqlite3";

let db: Database.Database;

beforeEach(() => {
  db = createDatabase(":memory:");
  insertPost(db, {
    brand_id: "carephoto",
    caption: "Amazing AI results!",
    hashtags: ["#ai", "#photo"],
    content_theme: "before-after",
  });
  insertPost(db, {
    brand_id: "carephoto",
    caption: "Tips for better headshots",
    hashtags: ["#headshots"],
    content_theme: "tips",
  });
});

describe("getRecentPostsTool", () => {
  it("returns formatted recent posts", () => {
    const result = getRecentPostsTool(db, "carephoto", 5);
    expect(result).toContain("Amazing AI results!");
    expect(result).toContain("Tips for better headshots");
  });

  it("respects limit", () => {
    const result = getRecentPostsTool(db, "carephoto", 1);
    expect(result).toContain("Tips for better headshots");
    expect(result).not.toContain("Amazing AI results!");
  });
});
