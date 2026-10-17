import { it, expect } from "vitest";
import { safeNextPath } from "./safe-redirect";
it("allows same-origin relative paths", () => {
  expect(safeNextPath("/brands/x")).toBe("/brands/x");
  expect(safeNextPath("/ok?x=1#y")).toBe("/ok?x=1#y");
  expect(safeNextPath("/%2F%2Fevil.com")).toBe("/%2F%2Fevil.com");
});
it("rejects open-redirect attempts", () => {
  for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "https:evil.com", "/\t/evil.com", "/\n/evil.com", "/\r/evil.com", "/..//evil.com", "/.//evil.com", "/a/..//evil.com", "/a/../..//evil.com", "/%2e%2e//evil.com", "/%2E//evil.com", " //evil.com", null, undefined, ""]) {
    expect(safeNextPath(bad)).toBe("/");
  }
});
