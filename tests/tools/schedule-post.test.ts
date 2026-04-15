import { describe, it, expect, vi, beforeEach } from "vitest";
import { schedulePost } from "../../src/tools/schedule-post.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.stubEnv("POSTIZ_API_KEY", "test-key");
  vi.stubEnv("POSTIZ_BASE_URL", "https://postiz.test/api/public/v1");
  mockFetch.mockReset();
});

function mockPostizFlow(postId = "post-123") {
  // 1. GET /integrations
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve([
        { id: "int-1", identifier: "instagram", name: "Test IG" },
      ]),
  });
  // 2. POST /upload-from-url
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve({ id: "media-1", path: "https://cdn.test/img.webp" }),
  });
  // 3. POST /posts
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ id: postId }),
  });
}

describe("schedulePost", () => {
  it("sends a post to Postiz and returns confirmation", async () => {
    mockPostizFlow("post-123");

    const result = await schedulePost({
      caption: "Check out our AI edits!",
      hashtags: ["#ai", "#photo"],
      images: ["https://example.com/img.jpg"],
      scheduledTime: "2026-04-12T10:00:00Z",
    });

    expect(result).toContain("post-123");
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("posts immediately when no scheduledTime", async () => {
    mockPostizFlow();

    const result = await schedulePost({
      caption: "Test",
      hashtags: [],
      images: ["https://example.com/img.jpg"],
    });

    expect(result).toContain("successfully");
    // Check the post body has type "now"
    const postCall = mockFetch.mock.calls[2];
    const body = JSON.parse(postCall[1].body);
    expect(body.type).toBe("now");
  });

  it("returns error message on post failure", async () => {
    // integrations OK
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          { id: "int-1", identifier: "instagram", name: "Test IG" },
        ]),
    });
    // upload OK
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ id: "media-1", path: "https://cdn.test/img.webp" }),
    });
    // post fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve("Bad request"),
    });

    const result = await schedulePost({
      caption: "Test",
      hashtags: [],
      images: ["https://example.com/img.jpg"],
    });

    expect(result).toContain("Failed");
    expect(result).toContain("400");
  });

  it("returns error when no Instagram integration found", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    const result = await schedulePost({
      caption: "Test",
      hashtags: [],
      images: ["https://example.com/img.jpg"],
    });

    expect(result).toContain("No Instagram integration found");
  });

  it("returns message when API key not configured", async () => {
    vi.stubEnv("POSTIZ_API_KEY", "");

    const result = await schedulePost({
      caption: "Test",
      hashtags: [],
      images: ["https://example.com/img.jpg"],
    });

    expect(result).toContain("not configured");
  });

  it("uploads multiple images for carousel post", async () => {
    // 1. GET /integrations
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          { id: "int-1", identifier: "instagram", name: "Test IG" },
        ]),
    });
    // 2. POST /upload-from-url (image 1)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ id: "media-1", path: "https://cdn.test/img1.webp" }),
    });
    // 3. POST /upload-from-url (image 2)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ id: "media-2", path: "https://cdn.test/img2.webp" }),
    });
    // 4. POST /posts
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: "carousel-123" }),
    });

    const result = await schedulePost({
      caption: "Carousel post!",
      hashtags: ["#carousel"],
      images: [
        "https://example.com/img1.jpg",
        "https://example.com/img2.jpg",
      ],
    });

    expect(result).toContain("carousel-123");
    expect(mockFetch).toHaveBeenCalledTimes(4);

    const postCall = mockFetch.mock.calls[3];
    const body = JSON.parse(postCall[1].body);
    expect(body.posts[0].value[0].image).toHaveLength(2);
  });
});
