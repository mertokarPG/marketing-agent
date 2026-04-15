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
  postingSchedule: { frequency: "daily", preferredTime: "10:00" },
  brandDir: "/tmp",
};

describe("buildTools", () => {
  it("returns 6 tools without promptBankPath", () => {
    const db = createDatabase(":memory:");
    const tools = buildTools(mockBrand, db);
    expect(tools).toHaveLength(6);
    expect(tools.map((t) => t.name)).not.toContain("browse_prompt_bank");
    db.close();
  });

  it("returns 7 tools with promptBankPath", () => {
    const db = createDatabase(":memory:");
    const brandWithBank = { ...mockBrand, promptBankPath: "/tmp/prompts.json" };
    const tools = buildTools(brandWithBank, db);
    expect(tools).toHaveLength(7);
    expect(tools.map((t) => t.name)).toContain("browse_prompt_bank");
    db.close();
  });
});
