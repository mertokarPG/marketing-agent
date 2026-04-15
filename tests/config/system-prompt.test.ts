import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../../src/config/system-prompt.js";
import { loadBrand } from "../../src/config/load-brand.js";
import type { BrandConfig } from "../../src/config/load-brand.js";
import fs from "fs";
import path from "path";
import os from "os";

const mockBrand: BrandConfig = {
  id: "testbrand",
  name: "Test Brand",
  domain: "test.com",
  niche: "testing",
  description: "A test brand",
  competitors: [
    { name: "Competitor A", website: "https://a.com" },
    { name: "Competitor B" },
  ],
  keywords: ["test", "brand"],
  tone: "Professional and direct",
  postingSchedule: { frequency: "daily", preferredTime: "10:00" },
  brandDir: "/tmp",
};

describe("buildSystemPrompt", () => {
  it("includes brand name and domain", () => {
    const prompt = buildSystemPrompt(mockBrand);
    expect(prompt).toContain("Test Brand");
    expect(prompt).toContain("test.com");
  });

  it("includes competitor names", () => {
    const prompt = buildSystemPrompt(mockBrand);
    expect(prompt).toContain("Competitor A");
    expect(prompt).toContain("Competitor B");
  });

  it("includes today's date", () => {
    const prompt = buildSystemPrompt(mockBrand);
    const today = new Date().toISOString().split("T")[0];
    expect(prompt).toContain(today);
  });

  it("includes brand tone", () => {
    const prompt = buildSystemPrompt(mockBrand);
    expect(prompt).toContain("Professional and direct");
  });
});

describe("loadBrand", () => {
  it("loads brand from directory with branding and carousel config", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "brand-test-"));
    const brandDir = path.join(tmpDir, "testbrand");
    fs.mkdirSync(brandDir, { recursive: true });
    fs.mkdirSync(path.join(brandDir, "assets"), { recursive: true });
    // Create a minimal logo file
    fs.writeFileSync(path.join(brandDir, "assets", "logo.png"), "fake-png");

    const config = {
      id: "testbrand",
      name: "Test Brand",
      domain: "test.com",
      niche: "testing",
      description: "A test brand",
      competitors: [{ name: "Comp A" }],
      keywords: ["test"],
      tone: "Professional",
      postingSchedule: { frequency: "daily", preferredTime: "10:00" },
      instagramHandle: "testbrand",
      branding: {
        enabled: true,
        logoPath: "assets/logo.png",
        showLogo: true,
        showHandle: true,
        showPageIndicator: true,
        showSwipeArrow: true,
      },
      carousel: {
        preferCarousel: true,
        frequency: 0.4,
        maxSlides: 10,
        minSlides: 2,
      },
    };

    fs.writeFileSync(
      path.join(brandDir, "brand.json"),
      JSON.stringify(config)
    );

    const brand = loadBrand("testbrand", tmpDir);
    expect(brand.instagramHandle).toBe("testbrand");
    expect(brand.branding?.enabled).toBe(true);
    expect(brand.branding?.logoPath).toBe("assets/logo.png");
    expect(brand.carousel?.frequency).toBe(0.4);
    expect(brand.brandDir).toBe(brandDir);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("loads brand without branding config (optional)", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "brand-test-"));
    const brandDir = path.join(tmpDir, "minimal");
    fs.mkdirSync(brandDir, { recursive: true });

    const config = {
      id: "minimal",
      name: "Minimal Brand",
      domain: "min.com",
      niche: "testing",
      description: "No branding",
      competitors: [],
      keywords: [],
      tone: "Neutral",
      postingSchedule: { frequency: "daily", preferredTime: "10:00" },
    };

    fs.writeFileSync(
      path.join(brandDir, "brand.json"),
      JSON.stringify(config)
    );

    const brand = loadBrand("minimal", tmpDir);
    expect(brand.branding).toBeUndefined();
    expect(brand.carousel).toBeUndefined();
    expect(brand.instagramHandle).toBeUndefined();

    fs.rmSync(tmpDir, { recursive: true });
  });
});
