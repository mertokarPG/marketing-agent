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

  describe("every tenant table", () => {
    const tables = ["brands", "brand_members", "brand_assets", "brand_sources", "trends", "posts", "post_metrics", "competitor_snapshots", "agent_runs"];
    const stranger = "99999999-9999-9999-9999-999999999999";
    const denied = (t: string): string => ({
      brands: "insert into brands (slug, name) values ('zz-new','n')",
      brand_members: `insert into brand_members (brand_id, user_id, role) values ('${brandA}','${alice}','viewer')`,
      brand_assets: `insert into brand_assets (brand_id, kind, storage_path) values ('${brandA}','logo','zz')`,
      brand_sources: `insert into brand_sources (brand_id, source) values ('${brandA}','{}')`,
      trends: `insert into trends (brand_id, source_id, category, title, url) values ('${brandA}','s','c','t','zz')`,
      posts: `insert into posts (brand_id, kind, status, planned_at, caption) values ('${brandA}','core','pending_approval',now(),'c')`,
      post_metrics: `insert into post_metrics (post_id, brand_id) values (gen_random_uuid(),'${brandA}')`,
      competitor_snapshots: `insert into competitor_snapshots (brand_id, competitor_name) values ('${brandA}','n')`,
      agent_runs: `insert into agent_runs (brand_id, kind, period_key) values ('${brandA}','manual','zz')`,
    } as Record<string, string>)[t];
    const scope = (t: string) => (t === "brands" ? "id" : "brand_id");

    beforeEach(async () => {
      for (const b of [brandA, brandB]) {
        await db.query("insert into brand_assets (brand_id, kind, storage_path) values ($1,'logo',$2)", [b, `${b}/logo.png`]);
        await db.query("insert into brand_sources (brand_id, source) values ($1,'{}')", [b]);
        await db.query("insert into trends (brand_id, source_id, category, title, url) values ($1,'s','c','t',$2)", [b, `https://x/${b}`]);
        await db.query("insert into agent_runs (brand_id, kind, period_key) values ($1,'manual','k')", [b]);
        const [p] = await db.query<{ id: string }>(
          "insert into posts (brand_id, kind, status, planned_at, caption) values ($1,'core','pending_approval', now(), 'c') returning id", [b]);
        await db.query("insert into post_metrics (post_id, brand_id) values ($1,$2)", [p.id, b]);
        await db.query("insert into competitor_snapshots (brand_id, competitor_name) values ($1,'n')", [b]);
      }
      await addTestMember(db, brandB, "bob@example.com");
    });

    it.each(tables)("%s: member sees only own brand, stranger none, insert denied", async (t) => {
      const col = scope(t);
      const rows = await asUser(alice, () => db.query<Record<string, string>>(`select ${col} as k from ${t}`));
      expect(rows.length).toBeGreaterThan(0);
      expect(new Set(rows.map((r) => r.k))).toEqual(new Set([brandA]));
      expect(await asUser(stranger, () => db.query(`select * from ${t}`))).toEqual([]);
      await expect(
        asUser(alice, () => db.query(denied(t)))
      ).rejects.toThrow(/permission denied/);
    });
  });
});
