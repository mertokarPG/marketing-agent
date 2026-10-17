// tests/e2e/dry-run.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDatabase } from "../../src/db/schema.js";
import { buildTools } from "../../src/orchestrator.js";
import type { BrandConfig } from "../../src/config/load-brand.js";

const mockBrand: BrandConfig = {
  id: "testbrand",
  name: "Test Brand",
  domain: "test.com",
  niche: "testing",
  description: "A test brand for dry runs",
  competitors: [{ name: "Competitor A", website: "https://a.com" }],
  keywords: ["test"],
  tone: "Professional",
  postingSchedule: { frequency: "daily", preferredTime: "10:00" },
  brandDir: "/tmp",
};

describe("dry run", () => {
  it("all tools are callable and return strings", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "");
    vi.stubEnv("POSTIZ_API_KEY", "");
    vi.stubEnv("SMTP_HOST", "");

    const db = createDatabase(":memory:");
    const tools = buildTools(mockBrand, db);

    // Each tool should have name and run function
    for (const tool of tools) {
      expect(typeof tool.name).toBe("string");
      expect(typeof tool.run).toBe("function");
    }

    // Test the SQLite tools directly (no external deps)
    // tools.find() returns the union tool type, whose run() args collapse to
    // never — cast to any for per-tool invocation in the test.
    const recentPostsTool = tools.find((t) => t.name === "get_recent_posts") as any;
    const result = await recentPostsTool!.run({ limit: 5 });
    expect(typeof result).toBe("string");
    expect(result).toContain("No recent posts");

    const perfTool = tools.find((t) => t.name === "get_post_performance") as any;
    const perfResult = await perfTool!.run({ limit: 5 });
    expect(typeof perfResult).toBe("string");
    expect(perfResult).toContain("No performance data");

    // Test notification (console fallback)
    const notifyTool = tools.find((t) => t.name === "send_notification") as any;
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const notifyResult = await notifyTool!.run({
      subject: "Test",
      body: "Test body",
    });
    expect(notifyResult).toContain("logged to console");
    consoleSpy.mockRestore();

    db.close();
  });
});
