import { describe, it, expect } from "vitest";
import { canEdit, switchHref } from "./brand-context";

describe("canEdit", () => {
  it("allows owner and editor, not viewer", () => {
    expect(canEdit("owner")).toBe(true);
    expect(canEdit("editor")).toBe(true);
    expect(canEdit("viewer")).toBe(false);
  });
});

describe("switchHref", () => {
  it("keeps the current top-level tab", () => {
    expect(switchHref("/b/a/results", "b")).toBe("/b/b/results");
    expect(switchHref("/b/a/calendar", "b")).toBe("/b/b/calendar");
    expect(switchHref("/b/a", "b")).toBe("/b/b");
    expect(switchHref("/b/a/", "b")).toBe("/b/b");
  });
  it("drops deeper detail paths", () => {
    expect(switchHref("/b/a/posts/x", "b")).toBe("/b/b");
    expect(switchHref("/b/a/results/extra", "b")).toBe("/b/b");
  });
  it("falls back to the brand home outside /b/", () => {
    expect(switchHref("/", "b")).toBe("/b/b");
  });
});
