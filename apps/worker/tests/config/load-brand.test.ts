import { describe, it, expect } from "vitest";
import { loadBrand, BrandConfig } from "../../src/config/load-brand.js";
import path from "path";

describe("loadBrand", () => {
  it("loads and validates a brand config from JSON", () => {
    const brand = loadBrand("carephoto", path.resolve("brands"));
    expect(brand.id).toBe("carephoto");
    expect(brand.name).toBe("carephoto.art");
    expect(brand.competitors.length).toBeGreaterThan(0);
    expect(brand.keywords.length).toBeGreaterThan(0);
  });

  it("throws on missing brand file", () => {
    expect(() => loadBrand("nonexistent", path.resolve("brands"))).toThrow();
  });

  it("throws on invalid brand config", () => {
    expect(() => loadBrand("nonexistent", path.resolve("brands"))).toThrow();
  });
});
