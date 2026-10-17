import { it, expect } from "vitest";
import { drain } from "../../src/runtime/drain.js";

it("resolves true once all promises settle, even if some reject", async () => {
  expect(await drain([Promise.resolve(1), Promise.reject(new Error("x"))], 1000)).toBe(true);
});
it("resolves false when work outlasts the timeout", async () => {
  expect(await drain([new Promise(() => {})], 20)).toBe(false);
});
it("resolves true immediately with nothing in flight", async () => {
  expect(await drain([], 20)).toBe(true);
});
