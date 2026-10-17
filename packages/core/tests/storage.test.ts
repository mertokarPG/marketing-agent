import { it, expect } from "vitest";
import { MemoryStorage } from "../src/storage.js";

it("memory storage round-trips and records signed URL requests", async () => {
  const s = new MemoryStorage();
  await s.upload("post-media", "b/p/0.png", Buffer.from("x"), "image/png");
  expect((await s.download("post-media", "b/p/0.png")).toString()).toBe("x");
  expect(await s.signedUrl("post-media", "b/p/0.png", 3600)).toBe("memory://post-media/b/p/0.png?ttl=3600");
  expect(s.signedCalls).toEqual([{ bucket: "post-media", path: "b/p/0.png", ttlSec: 3600 }]);
  await expect(s.download("post-media", "missing")).rejects.toThrow(/not found/);
});
