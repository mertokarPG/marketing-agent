import { describe, it, expect, vi, beforeEach } from "vitest";
import { schedulePost } from "../../src/tools/schedule-post.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.stubEnv("POSTIZ_API_KEY", "test-key");
  vi.stubEnv("POSTIZ_BASE_URL", "https://app.postiz.com/api/v1");
  mockFetch.mockReset();
});

describe("schedulePost", () => {
  it("sends a post to Postiz and returns confirmation", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: "post-123", status: "scheduled" }),
    });

    const result = await schedulePost({
      caption: "Check out our AI edits!",
      hashtags: ["#ai", "#photo"],
      imageUrl: "https://example.com/img.jpg",
      scheduledTime: "2026-04-12T10:00:00Z",
    });

    expect(result).toContain("post-123");
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("returns error message on failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve("Bad request"),
    });

    const result = await schedulePost({
      caption: "Test",
      hashtags: [],
      imageUrl: "https://example.com/img.jpg",
    });

    expect(result).toContain("Failed");
  });
});
