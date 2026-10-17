import { describe, it, expect } from "vitest";
import { buildTools } from "../src/orchestrator.js";
import { createTestDb, seedTestBrand } from "@carepost/core/testing";
import { MemoryStorage, insertPost } from "@carepost/core";
import type { ToolContext } from "../src/runtime/types.js";

const testCtx = (o: Partial<ToolContext> = {}): ToolContext => ({
  storage: new MemoryStorage(), runId: null, kind: "manual",
  window: { start: new Date(), end: new Date(Date.now() + 86400_000) }, notify: async () => "", ...o,
});
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
    const tools = buildTools({ ...mockBrand, dbId }, db, testCtx());
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
    const tools = buildTools({ ...brandWithBank, dbId }, db, testCtx());
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
    const tools = buildTools({ ...brandWithGen, dbId }, db, testCtx());
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
    const tools = buildTools({ ...brandDisabled, dbId }, db, testCtx());
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
    const tools = buildTools({ ...brandWithBranding, dbId }, db, testCtx());
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
    const tools = buildTools({ ...brandDisabled, dbId }, db, testCtx());
    expect(tools.map((t) => t.name)).not.toContain("brand_image");
    expect(tools.map((t) => t.name)).not.toContain("brand_carousel");
  });

  it("registers save_post and get_planned_posts instead of schedule_post", async () => {
    const { db } = await createTestDb();
    const dbId = await seedTestBrand(db);
    const names = buildTools({ ...mockBrand, dbId }, db, testCtx()).map((t) => t.name);
    expect(names).toContain("save_post");
    expect(names).toContain("get_planned_posts");
    expect(names).not.toContain("schedule_post");
  });

  it("get_planned_posts covers the whole run window even beyond 7 days", async () => {
    const { db } = await createTestDb();
    const dbId = await seedTestBrand(db);
    const day = 86400_000;
    const now = Date.now();
    const post = (caption: string, at: number) => insertPost(db, {
      brand_id: dbId, kind: "core", status: "pending_approval", planned_at: new Date(at),
      caption, hashtags: [], media: [], prompt_ids: [], rationale: "r",
    });
    await post("Soon post", now + 2 * day);
    await post("Late window post", now + 8 * day);
    await post("After window post", now + 10 * day);
    const ctx = testCtx({ kind: "weekly_plan", window: { start: new Date(now), end: new Date(now + 9 * day) } });
    const tool = buildTools({ ...mockBrand, dbId }, db, ctx).find((t) => t.name === "get_planned_posts") as any;
    const out: string = await tool.run({});
    expect(out).toContain("Soon post");
    expect(out).toContain("Late window post");
    expect(out).not.toContain("After window post");
  });

  it("photo_overlay refuses local files outside the brand dirs and non-public URLs", async () => {
    const { db } = await createTestDb();
    const dbId = await seedTestBrand(db);
    const brand: BrandConfig = {
      ...mockBrand, dbId, instagramHandle: "testbrand",
      branding: { enabled: true, logoPath: "assets/logo.png", showLogo: true, showHandle: true, showPageIndicator: true, showSwipeArrow: true },
    };
    const tool = buildTools(brand, db, testCtx()).find((t) => t.name === "photo_overlay") as any;
    const run = (imageUrl: string) => tool.run({ templateId: "x", imageUrl, headline: "h", accentColor: null });
    expect(await run("/etc/passwd")).toMatch(/^photo_overlay failed: .*outside the brand and render directories/);
    expect(await run("http://169.254.169.254/")).toMatch(/^photo_overlay failed: only https/);
    expect(await run("https://169.254.169.254/latest")).toMatch(/^photo_overlay failed: .*non-public address/);
  });
});
