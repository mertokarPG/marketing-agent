import { describe, it, expect, vi } from "vitest";
import { scrapeCompetitor } from "../../src/tools/scrape-competitor.js";

// Mock Firecrawl
vi.mock("@mendable/firecrawl-js", () => ({
  default: class {
    scrapeUrl(url: string) {
      return Promise.resolve({
        success: true,
        markdown: "# Competitor Page\nSome content about their latest products.",
      });
    }
  },
}));

describe("scrapeCompetitor", () => {
  it("returns scraped content summary", async () => {
    const result = await scrapeCompetitor("Remini", "https://remini.ai");
    expect(result).toContain("Remini");
    expect(result).toContain("Competitor Page");
  });
});
