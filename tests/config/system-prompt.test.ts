import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../../src/config/system-prompt.js";
import type { BrandConfig } from "../../src/config/load-brand.js";

const mockBrand: BrandConfig = {
  id: "testbrand",
  name: "Test Brand",
  domain: "test.com",
  niche: "testing",
  description: "A test brand",
  competitors: [
    { name: "Competitor A", website: "https://a.com" },
    { name: "Competitor B" },
  ],
  keywords: ["test", "brand"],
  tone: "Professional and direct",
  instagram: { accountId: "123", accessToken: "abc" },
  postingSchedule: { frequency: "daily", preferredTime: "10:00" },
};

describe("buildSystemPrompt", () => {
  it("includes brand name and domain", () => {
    const prompt = buildSystemPrompt(mockBrand);
    expect(prompt).toContain("Test Brand");
    expect(prompt).toContain("test.com");
  });

  it("includes competitor names", () => {
    const prompt = buildSystemPrompt(mockBrand);
    expect(prompt).toContain("Competitor A");
    expect(prompt).toContain("Competitor B");
  });

  it("includes today's date", () => {
    const prompt = buildSystemPrompt(mockBrand);
    const today = new Date().toISOString().split("T")[0];
    expect(prompt).toContain(today);
  });

  it("includes brand tone", () => {
    const prompt = buildSystemPrompt(mockBrand);
    expect(prompt).toContain("Professional and direct");
  });
});
