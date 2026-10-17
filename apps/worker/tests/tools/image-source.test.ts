import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Agent } from "undici";
import { ImageSourceError, guardedLookup, isBlockedAddress, loadImageSource, sniffImage } from "../../src/tools/image-source.js";

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
    for (const a of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "2002:7f00:1::1", "2001:0:4136:e378::1"])
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

  it("validates DNS at connect time: the hook is the only resolution and blocks a private answer", async () => {
    // No fetch mock: the real undici fetch runs with the guarded dispatcher. The
    // resolver answers 127.0.0.1, so the connection is refused before any socket opens.
    const lookup = vi.fn().mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    await expect(loadImageSource("https://rebind.example.com/x.png", { brandDir, deps: { lookup } }))
      .rejects.toThrow(/rebind.example.com resolves to a non-public address/);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith("rebind.example.com");
  });

  it("re-checks every connect-time resolution, so a rebinding answer is refused", async () => {
    const resolve = vi.fn()
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    const hook = guardedLookup(resolve);
    const call = (opts: { all?: boolean }) => new Promise<unknown[]>((res) => hook("h.example.com", opts, (...a) => res(a)));
    expect(await call({ all: true })).toEqual([null, [{ address: "93.184.216.34", family: 4 }]]);
    const [err] = await call({});
    expect(err).toBeInstanceOf(ImageSourceError);
  });

  it("hands the socket only validated addresses and rejects mixed answers", async () => {
    const hook = guardedLookup(async () => [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.1", family: 4 }]);
    const [err] = await new Promise<unknown[]>((res) => hook("h.example.com", { all: true }, (...a) => res(a)));
    expect((err as Error).message).toMatch(/non-public/);
    const ok = guardedLookup(async () => [{ address: "93.184.216.34", family: 4 }]);
    expect(await new Promise<unknown[]>((res) => ok("h.example.com", {}, (...a) => res(a)))).toEqual([null, "93.184.216.34", 4]);
  });

  it("passes the guarded dispatcher to every redirect hop", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://cdn2.example.com/b" } }))
      .mockResolvedValueOnce(new Response(PNG, { status: 200 }));
    await loadImageSource("https://cdn.example.com/a", { brandDir, deps: { fetch: fetchFn as any } });
    const [d1, d2] = fetchFn.mock.calls.map((c) => c[1].dispatcher);
    expect(d1).toBeInstanceOf(Agent);
    expect(d2).toBe(d1);
  });

  it("throws ImageSourceError for a missing local file", async () => {
    await expect(loadImageSource("nope.png", { brandDir })).rejects.toBeInstanceOf(ImageSourceError);
  });
});
