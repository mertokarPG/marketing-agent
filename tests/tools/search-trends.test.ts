import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchTrends } from "../../src/tools/search-trends.js";

beforeEach(() => {
  vi.stubEnv("FIRECRAWL_API_KEY", "test-key");
});

vi.mock("@mendable/firecrawl-js", () => ({
  default: class {
    search(query: string) {
      return Promise.resolve({
        success: true,
        data: [
          { title: "AI Photo Trends 2026", url: "https://example.com/1", description: "Latest trends in AI photography" },
          { title: "Dating Profile Tips", url: "https://example.com/2", description: "How AI is changing dating photos" },
        ],
      });
    }
  },
}));

describe("searchTrends", () => {
  it("returns trend results for keywords", async () => {
    const result = await searchTrends(["AI photo editor", "AI dating photos"]);
    expect(result).toContain("AI Photo Trends");
    expect(result).toContain("Dating Profile Tips");
  });
});
