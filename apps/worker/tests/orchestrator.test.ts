import { describe, it, expect } from "vitest";
import { buildTools } from "../src/orchestrator.js";
import { createTestDb, seedTestBrand } from "@carepost/core/testing";
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
  postingSchedule: { coreDays: ["mon","tue","wed","thu","fri"], defaultTime: "10:00" }, timezone: "Europe/Brussels", approvalMode: "review", publisher: null, dbId: "00000000-0000-4000-8000-000000000001", slug: "testbrand", productPhotos: [],
  brandDir: "/tmp/testbrand",
};

describe("buildTools", () => {
  it("does not register optional tools without flags", async () => {
    const { db } = await createTestDb();
    const dbId = await seedTestBrand(db);
    const tools = buildTools({ ...mockBrand, dbId }, db);
    const names = tools.map((t) => t.name);
    expect(names).not.toContain("browse_prompt_bank");
    expect(names).not.toContain("brand_image");
    expect(names).not.toContain("brand_carousel");
    expect(names).not.toContain("generate_image");
  });

  it("registers browse_prompt_bank when promptBankPath is set", async () => {
    const { db } = await createTestDb();
    const dbId = await seedTestBrand(db);
    const brandWithBank = { ...mockBrand, promptBankPath: "/tmp/prompts.json" };
    const tools = buildTools({ ...brandWithBank, dbId }, db);
    expect(tools.map((t) => t.name)).toContain("browse_prompt_bank");
  });

  it("registers generate_image when imageGeneration.enabled", async () => {
    const { db } = await createTestDb();
    const dbId = await seedTestBrand(db);
    const brandWithGen: BrandConfig = {
      ...mockBrand,
      imageGeneration: {
        enabled: true,
        provider: "carephoto",
        defaultModel: "nano-banana-2",
        defaultAspectRatio: "4:5",
      },
    };
    const tools = buildTools({ ...brandWithGen, dbId }, db);
    expect(tools.map((t) => t.name)).toContain("generate_image");
  });

  it("does not register generate_image when imageGeneration.enabled=false", async () => {
    const { db } = await createTestDb();
    const dbId = await seedTestBrand(db);
    const brandDisabled: BrandConfig = {
      ...mockBrand,
      imageGeneration: {
        enabled: false,
        provider: "carephoto",
        defaultModel: "nano-banana-2",
        defaultAspectRatio: "4:5",
      },
    };
    const tools = buildTools({ ...brandDisabled, dbId }, db);
    expect(tools.map((t) => t.name)).not.toContain("generate_image");
  });

  it("returns 8 tools with branding enabled", async () => {
    const { db } = await createTestDb();
    const dbId = await seedTestBrand(db);
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
    const tools = buildTools({ ...brandWithBranding, dbId }, db);
    const names = tools.map((t) => t.name);
    expect(names).toContain("brand_image");
    expect(names).toContain("brand_carousel");
    expect(names).toContain("carousel_cover");
    expect(names).toContain("body_slide");
    expect(names).toContain("photo_overlay");
  });

  it("does not register branding tools when branding disabled", async () => {
    const { db } = await createTestDb();
    const dbId = await seedTestBrand(db);
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
    const tools = buildTools({ ...brandDisabled, dbId }, db);
    expect(tools.map((t) => t.name)).not.toContain("brand_image");
    expect(tools.map((t) => t.name)).not.toContain("brand_carousel");
  });
});
