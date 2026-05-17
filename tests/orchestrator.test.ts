import { describe, it, expect } from "vitest";
import { buildTools } from "../src/orchestrator.js";
import { createDatabase } from "../src/db/schema.js";
import type { BrandConfig } from "../src/config/load-brand.js";

const mockBrand: BrandConfig = {
  id: "testbrand",
  name: "Test Brand",
  domain: "test.com",
  niche: "testing",
  description: "A test brand",
  competitors: [{ name: "Competitor A", website: "https://a.com" }],
  keywords: ["test"],
  tone: "Professional",
  postingSchedule: { frequency: "daily", preferredTime: "10:00" },
  brandDir: "/tmp/testbrand",
};

describe("buildTools", () => {
  it("does not register optional tools without flags", () => {
    const db = createDatabase(":memory:");
    const tools = buildTools(mockBrand, db);
    const names = tools.map((t) => t.name);
    expect(names).not.toContain("browse_prompt_bank");
    expect(names).not.toContain("brand_image");
    expect(names).not.toContain("brand_carousel");
    expect(names).not.toContain("generate_image");
    db.close();
  });

  it("registers browse_prompt_bank when promptBankPath is set", () => {
    const db = createDatabase(":memory:");
    const brandWithBank = { ...mockBrand, promptBankPath: "/tmp/prompts.json" };
    const tools = buildTools(brandWithBank, db);
    expect(tools.map((t) => t.name)).toContain("browse_prompt_bank");
    db.close();
  });

  it("registers generate_image when imageGeneration.enabled", () => {
    const db = createDatabase(":memory:");
    const brandWithGen: BrandConfig = {
      ...mockBrand,
      imageGeneration: {
        enabled: true,
        provider: "carephoto",
        defaultModel: "nano-banana-2",
        defaultAspectRatio: "4:5",
      },
    };
    const tools = buildTools(brandWithGen, db);
    expect(tools.map((t) => t.name)).toContain("generate_image");
    db.close();
  });

  it("does not register generate_image when imageGeneration.enabled=false", () => {
    const db = createDatabase(":memory:");
    const brandDisabled: BrandConfig = {
      ...mockBrand,
      imageGeneration: {
        enabled: false,
        provider: "carephoto",
        defaultModel: "nano-banana-2",
        defaultAspectRatio: "4:5",
      },
    };
    const tools = buildTools(brandDisabled, db);
    expect(tools.map((t) => t.name)).not.toContain("generate_image");
    db.close();
  });

  it("returns 8 tools with branding enabled", () => {
    const db = createDatabase(":memory:");
    const brandWithBranding: BrandConfig = {
      ...mockBrand,
      instagramHandle: "testbrand",
      branding: {
        enabled: true,
        logoPath: "assets/logo.png",
        showLogo: true,
        showHandle: true,
        showPageIndicator: true,
        showSwipeArrow: true,
      },
    };
    const tools = buildTools(brandWithBranding, db);
    const names = tools.map((t) => t.name);
    expect(names).toContain("brand_image");
    expect(names).toContain("brand_carousel");
    expect(names).toContain("carousel_cover");
    expect(names).toContain("body_slide");
    expect(names).toContain("photo_overlay");
    db.close();
  });

  it("does not register branding tools when branding disabled", () => {
    const db = createDatabase(":memory:");
    const brandDisabled: BrandConfig = {
      ...mockBrand,
      branding: {
        enabled: false,
        logoPath: "assets/logo.png",
        showLogo: true,
        showHandle: true,
        showPageIndicator: true,
        showSwipeArrow: true,
      },
    };
    const tools = buildTools(brandDisabled, db);
    expect(tools.map((t) => t.name)).not.toContain("brand_image");
    expect(tools.map((t) => t.name)).not.toContain("brand_carousel");
    db.close();
  });
});
