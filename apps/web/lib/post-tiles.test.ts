import { describe, it, expect } from "vitest";
import { chunkIds } from "./post-tiles";

describe("chunkIds", () => {
  it("splits into chunks of 10 by default", () => {
    const ids = Array.from({ length: 23 }, (_, i) => `p${i}`);
    expect(chunkIds(ids).map((c) => c.length)).toEqual([10, 10, 3]);
    expect(chunkIds([])).toEqual([]);
  });
});
