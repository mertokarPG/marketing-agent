import { it, expect } from "vitest";
import { brandConfigFromRow, assetLocalPath } from "../src/brand-config.js";
import type { BrandRow, AssetRow } from "../src/repo/brands.js";

const row = {
  id: "0b6d6a3e-0000-4000-8000-000000000001", slug: "kuanyin", name: "Kuanyin Skin", domain: "kuanyin.be",
  niche: "skincare", description: "d", tone: "calm", keywords: ["skin"], competitors: [], instagram_handle: "kuanyin",
  design_system: null, prompt_bank_path: null, branding: { enabled: true, logoPath: "assets/logo.png" }, carousel: null,
  hot_topics: null, image_generation: null, posting_schedule: { coreDays: ["mon", "wed"], defaultTime: "09:30" },
  timezone: "Europe/Brussels", approval_mode: "review", status: "active", publisher: null, created_at: new Date(),
} as BrandRow;

it("maps a row and product assets to BrandConfig", () => {
  const assets = [
    { kind: "logo", storage_path: `${row.id}/logo/logo.png`, label: null },
    { kind: "product", storage_path: `${row.id}/product/serum.jpg`, label: "Rosehip serum" },
  ] as AssetRow[];
  const b = brandConfigFromRow(row, assets, "/tmp/run1");
  expect(b).toMatchObject({
    id: "kuanyin", dbId: row.id, slug: "kuanyin", timezone: "Europe/Brussels", approvalMode: "review", publisher: null,
    brandDir: "/tmp/run1", postingSchedule: { coreDays: ["mon", "wed"], defaultTime: "09:30" },
    productPhotos: [{ path: "assets/products/serum.jpg", label: "Rosehip serum" }],
  });
  expect(assetLocalPath(assets[0])).toBe("assets/logo.png");
});

it("applies the default 5-day schedule", () => {
  const b = brandConfigFromRow({ ...row, posting_schedule: {} } as BrandRow, [], "/tmp/x");
  expect(b.postingSchedule).toEqual({ coreDays: ["mon", "tue", "wed", "thu", "fri"], defaultTime: "10:00" });
});

it("rejects an invalid time", () => {
  expect(() => brandConfigFromRow({ ...row, posting_schedule: { defaultTime: "25:00" } } as BrandRow, [], "/tmp/x")).toThrow();
});
