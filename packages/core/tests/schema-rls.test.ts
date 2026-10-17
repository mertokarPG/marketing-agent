import { describe, it, expect, beforeEach } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb, seedTestBrand, addTestMember } from "../src/testing.js";
import type { Db } from "../src/db.js";
import { enqueueRun } from "../src/repo/runs.js";

let db: Db;
let pg: PGlite;
let brandA: string;
let brandB: string;
let alice: string;

beforeEach(async () => {
  ({ db, pg } = await createTestDb());
  brandA = await seedTestBrand(db, { slug: "brand-a" });
  brandB = await seedTestBrand(db, { slug: "brand-b" });
  alice = await addTestMember(db, brandA, "alice@example.com");
});

async function asUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  await pg.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await pg.query("set role authenticated");
  try { return await fn(); } finally { await pg.query("reset role"); }
}

describe("RLS", () => {
  it("members see only their brands", async () => {
    const rows = await asUser(alice, () => db.query<{ slug: string }>("select slug from brands order by slug"));
    expect(rows.map((r) => r.slug)).toEqual(["brand-a"]);
  });

  it("members see only their brands' posts", async () => {
    for (const b of [brandA, brandB]) {
      await db.query(
        "insert into posts (brand_id, kind, status, planned_at, caption) values ($1,'core','pending_approval', now(), 'c')", [b]);
    }
    const rows = await asUser(alice, () => db.query<{ brand_id: string }>("select brand_id from posts"));
    expect(rows.map((r) => r.brand_id)).toEqual([brandA]);
  });

  it("non-members see nothing", async () => {
    const stranger = "99999999-9999-9999-9999-999999999999";
    const rows = await asUser(stranger, () => db.query("select * from brands"));
    expect(rows).toEqual([]);
  });

  it("authenticated cannot write", async () => {
    await expect(
      asUser(alice, () => db.query("update brands set name = 'x' where id = $1", [brandA]))
    ).rejects.toThrow(/permission denied/);
  });

  it("enqueueing the same period twice is a no-op", async () => {
    expect(await enqueueRun(db, brandA, "daily_check", "2026-10-19")).not.toBeNull();
    expect(await enqueueRun(db, brandA, "daily_check", "2026-10-19")).toBeNull();
  });
});
