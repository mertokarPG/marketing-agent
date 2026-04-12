// tests/orchestrator.test.ts
import { describe, it, expect, vi } from "vitest";
import { buildTools } from "../src/orchestrator.js";
import { createDatabase } from "../src/db/schema.js";
import type { BrandConfig } from "../src/config/load-brand.js";

const mockBrand: BrandConfig = {
  id: "testbrand",
  name: "Test Brand",
  domain: "test.com",
  niche: "testing",
  description: "A test brand",
  competitors: [{ name: "Competitor A", website: "https://a.com" }],
  keywords: ["test"],
  tone: "Professional",
  instagram: { accountId: "123", accessToken: "abc" },
  postingSchedule: { frequency: "daily", preferredTime: "10:00" },
};

describe("buildTools", () => {
  it("returns an array of 6 tool definitions", () => {
    const db = createDatabase(":memory:");
    const tools = buildTools(mockBrand, db);
    expect(tools).toHaveLength(6);

    const names = tools.map((t) => t.name);
    expect(names).toContain("scrape_competitor");
    expect(names).toContain("search_trends");
    expect(names).toContain("get_recent_posts");
    expect(names).toContain("get_post_performance");
    expect(names).toContain("schedule_post");
    expect(names).toContain("send_notification");

    db.close();
  });
});
