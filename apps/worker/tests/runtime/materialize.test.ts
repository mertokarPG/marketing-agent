import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MemoryStorage } from "@carepost/core";
import { createTestDb, seedTestBrand } from "@carepost/core/testing";
import { materializeBrand } from "../../src/runtime/materialize.js";

describe("materializeBrand", () => {
  it("downloads assets into a temp brand dir and cleans up", async () => {
    const { db } = await createTestDb();
    const brandId = await seedTestBrand(db, { slug: "kuanyin" });
    const storage = new MemoryStorage();
    await storage.upload("brand-assets", `${brandId}/logo/logo.png`, Buffer.from("L"), "image/png");
    await storage.upload("brand-assets", `${brandId}/product/serum.jpg`, Buffer.from("S"), "image/jpeg");
    await db.query("insert into brand_assets (brand_id, kind, storage_path, label) values ($1,'logo',$2,null), ($1,'product',$3,'Serum')",
      [brandId, `${brandId}/logo/logo.png`, `${brandId}/product/serum.jpg`]);

    const { brand, cleanup } = await materializeBrand(db, storage, brandId, os.tmpdir());
    expect(fs.readFileSync(path.join(brand.brandDir, "assets/logo.png"), "utf8")).toBe("L");
    expect(fs.readFileSync(path.join(brand.brandDir, "assets/products/serum.jpg"), "utf8")).toBe("S");
    expect(brand.productPhotos).toEqual([{ path: "assets/products/serum.jpg", label: "Serum" }]);
    await cleanup();
    expect(fs.existsSync(brand.brandDir)).toBe(false);
  });

  it("creates a missing tmpRoot (clean checkout, CLI path)", async () => {
    const { db } = await createTestDb();
    const brandId = await seedTestBrand(db, { slug: "fresh" });
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "mat-"));
    const tmpRoot = path.join(base, "tmp", "runs");
    expect(fs.existsSync(tmpRoot)).toBe(false);
    const { brand, cleanup } = await materializeBrand(db, new MemoryStorage(), brandId, tmpRoot);
    expect(path.dirname(brand.brandDir)).toBe(tmpRoot);
    expect(fs.existsSync(brand.brandDir)).toBe(true);
    await cleanup();
    fs.rmSync(base, { recursive: true, force: true });
  });

  it("throws for an unknown brand", async () => {
    const { db } = await createTestDb();
    await expect(materializeBrand(db, new MemoryStorage(), "00000000-0000-4000-8000-000000000000", os.tmpdir()))
      .rejects.toThrow(/brand not found/);
  });
});
