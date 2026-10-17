import { it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryStorage } from "@carepost/core";
import { createTestDb } from "@carepost/core/testing";
import { seedBrandFromDir } from "../../scripts/lib/seed-brand.js";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/seed-brand/demo");

it("seeds brand, assets, sources and owner idempotently", async () => {
  const { db } = await createTestDb();
  await db.query("insert into auth.users (id, email) values (gen_random_uuid(), 'Owner@Demo.be')");
  const storage = new MemoryStorage();
  const id = await seedBrandFromDir({ db, storage }, DIR, "owner@demo.be");
  const again = await seedBrandFromDir({ db, storage }, DIR, "owner@demo.be");
  expect(again).toBe(id);

  const [b] = await db.query("select slug, timezone, approval_mode, branding from brands where id = $1", [id]);
  expect(b).toMatchObject({ slug: "demo", timezone: "Europe/Brussels", approval_mode: "review" });
  expect(b.branding.logoPath).toBe("assets/logo.png");
  const assets = await db.query("select kind, storage_path, label from brand_assets where brand_id = $1 order by kind", [id]);
  expect(assets).toEqual([
    { kind: "logo", storage_path: `${id}/logo/logo.png`, label: null },
    { kind: "product", storage_path: `${id}/product/rosehip-serum.jpg`, label: "rosehip serum" },
  ]);
  expect(storage.files.has(`brand-assets/${id}/product/rosehip-serum.jpg`)).toBe(true);
  expect(await db.query("select 1 from brand_sources where brand_id = $1", [id])).toHaveLength(1);
  expect(await db.query("select role from brand_members where brand_id = $1", [id])).toEqual([{ role: "owner" }]);
});

it("asks the owner to sign in first when the email is unknown", async () => {
  const { db } = await createTestDb();
  await expect(seedBrandFromDir({ db, storage: new MemoryStorage() }, DIR, "nobody@demo.be")).rejects.toThrow(/sign in to the web app/i);
});

it("re-seeding never overwrites approval_mode, publisher or status of an existing brand", async () => {
  const { db } = await createTestDb();
  await db.query("insert into auth.users (id, email) values (gen_random_uuid(), 'owner@demo.be')");
  const storage = new MemoryStorage();
  const id = await seedBrandFromDir({ db, storage }, DIR, "owner@demo.be");
  const [first] = await db.query("select approval_mode, publisher, status from brands where id = $1", [id]);
  expect(first).toEqual({ approval_mode: "review", publisher: null, status: "active" }); // first insert: from brand.json

  await db.query("update brands set approval_mode = 'autopilot', publisher = 'postiz', status = 'paused', name = 'Old' where id = $1", [id]);
  await seedBrandFromDir({ db, storage }, DIR, "owner@demo.be");
  const [after] = await db.query("select approval_mode, publisher, status, name from brands where id = $1", [id]);
  expect(after).toMatchObject({ approval_mode: "autopilot", publisher: "postiz", status: "paused" });
  expect(after.name).not.toBe("Old"); // file-owned columns are still refreshed
});
