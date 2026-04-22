import { describe, it, expect, beforeEach } from "vitest";
import { createDatabase } from "../../src/db/schema.js";
import {
  insertPost,
  getRecentPosts,
  insertAnalytics,
  getPostPerformance,
  insertCompetitorSnapshot,
  insertContentCalendarEntry,
  updateContentCalendarStatus,
} from "../../src/db/queries.js";
import Database from "better-sqlite3";

let db: Database.Database;

beforeEach(() => {
  db = createDatabase(":memory:");
});

describe("posts", () => {
  it("inserts and retrieves posts", () => {
    insertPost(db, {
      brand_id: "carephoto",
      caption: "Test caption",
      hashtags: ["#ai", "#photo"],
      image_url: "https://example.com/img.jpg",
      content_theme: "before-after",
    });

    const posts = getRecentPosts(db, "carephoto", 5);
    expect(posts).toHaveLength(1);
    expect(posts[0].caption).toBe("Test caption");
    expect(posts[0].hashtags).toEqual(["#ai", "#photo"]);
  });
});

describe("analytics", () => {
  it("inserts analytics and retrieves performance", () => {
    insertPost(db, {
      brand_id: "carephoto",
      caption: "Test",
      hashtags: [],
      content_theme: "tip",
    });

    const posts = getRecentPosts(db, "carephoto", 1);
    insertAnalytics(db, {
      post_id: posts[0].id,
      brand_id: "carephoto",
      likes: 50,
      comments: 10,
      shares: 5,
      reach: 1000,
      impressions: 1500,
      views: 2000,
      saves: 12,
      profile_visits: 20,
      link_clicks: 8,
    });

    const perf = getPostPerformance(db, "carephoto", 5);
    expect(perf).toHaveLength(1);
    expect(perf[0].likes).toBe(50);
    expect(perf[0].caption).toBe("Test");
  });
});

describe("competitor_snapshots", () => {
  it("inserts a snapshot", () => {
    insertCompetitorSnapshot(db, {
      brand_id: "carephoto",
      competitor_name: "Remini",
      content_summary: "Lots of before/after content",
      engagement_notes: "High engagement on transformation posts",
    });

    const rows = db
      .prepare("SELECT * FROM competitor_snapshots WHERE brand_id = ?")
      .all("carephoto") as Array<{ competitor_name: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].competitor_name).toBe("Remini");
  });
});

describe("content_calendar", () => {
  it("inserts and updates status", () => {
    const id = insertContentCalendarEntry(db, {
      brand_id: "carephoto",
      planned_date: "2026-04-12",
      theme: "before-after",
      caption_draft: "Draft caption",
      hashtags: ["#ai"],
      reasoning: "High engagement on transformation content",
    });

    updateContentCalendarStatus(db, id, "posted");

    const row = db
      .prepare("SELECT status FROM content_calendar WHERE id = ?")
      .get(id) as { status: string };
    expect(row.status).toBe("posted");
  });
});
