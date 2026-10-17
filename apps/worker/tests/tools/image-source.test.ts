import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ImageSourceError, isBlockedAddress, loadImageSource, sniffImage } from "../../src/tools/image-source.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(4)]);
const brandDir = fs.mkdtempSync(path.join(os.tmpdir(), "image-source-"));
const publicLookup = vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);

describe("loadImageSource", () => {
  it("detects types from magic bytes only", () => {
    expect(sniffImage(PNG)).toBe("png");
    expect(sniffImage(WEBP)).toBe("webp");
    expect(sniffImage(Buffer.from("GIF89a"))).toBeNull();
  });

  it("blocks private, loopback, link-local, CGNAT and ULA ranges", () => {
    for (const a of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"])
      expect(isBlockedAddress(a), a).toBe(true);
    expect(isBlockedAddress("93.184.216.34")).toBe(false);
    expect(isBlockedAddress("2606:2800:220:1::1")).toBe(false);
  });

  it("re-validates redirect targets and rejects a hop to a private host", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://127.0.0.1/x.png" } }));
    await expect(loadImageSource("https://cdn.example.com/a", { brandDir, deps: { lookup: publicLookup, fetch: fetchFn as any } }))
      .rejects.toThrow(/non-public address/);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("follows a redirect to another public https host", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: "https://cdn2.example.com/b" } }))
      .mockResolvedValueOnce(new Response(WEBP, { status: 200 }));
    const img = await loadImageSource("https://cdn.example.com/a", { brandDir, deps: { lookup: publicLookup, fetch: fetchFn as any } });
    expect(img.ext).toBe("webp");
    expect(img.contentType).toBe("image/webp");
  });

  it("enforces the byte cap while streaming", async () => {
    const body = new ReadableStream({
      start(c) { c.enqueue(PNG); c.enqueue(new Uint8Array(100)); c.close(); },
    });
    const fetchFn = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    await expect(loadImageSource("https://cdn.example.com/a", { brandDir, maxBytes: 50, deps: { lookup: publicLookup, fetch: fetchFn as any } }))
      .rejects.toThrow(/exceeds 50 bytes/);
  });

  it("times out a hung fetch", async () => {
    const fetchFn = vi.fn((_u: unknown, init: RequestInit) => new Promise((_, reject) => {
      init.signal!.addEventListener("abort", () => reject(init.signal!.reason));
    }));
    await expect(loadImageSource("https://cdn.example.com/a", { brandDir, timeoutMs: 50, deps: { lookup: publicLookup, fetch: fetchFn as any } }))
      .rejects.toThrow(/timed out/);
  });

  it("throws ImageSourceError for a missing local file", async () => {
    await expect(loadImageSource("nope.png", { brandDir })).rejects.toBeInstanceOf(ImageSourceError);
  });
});
