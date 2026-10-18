import { describe, it, expect, beforeEach } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { createTestDb, seedTestBrand, addTestMember } from "../src/testing.js";
import type { Db } from "../src/db.js";
import { enqueueRun, claimNextRun } from "../src/repo/runs.js";
import { expirePendingPosts, expireMissedApprovedPosts, claimDuePosts, hasCorePostOnLocalDate, getPlannedPosts } from "../src/repo/posts.js";

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

async function post(brand: string, status: string, plannedAt: string, needsNewTime = false): Promise<string> {
  const [r] = await db.query<{ id: string }>(
    `insert into posts (brand_id, kind, status, planned_at, caption, needs_new_time)
     values ($1,'core',$2,${plannedAt},'c',$3) returning id`, [brand, status, needsNewTime]);
  return r.id;
}
const statusOf = async (id: string) => (await db.query<{ status: string }>("select status from posts where id = $1", [id]))[0].status;

describe("dashboard schema", () => {
  it("posts accept the reworking status", async () => {
    const id = await post(brandA, "reworking", "now()");
    expect(await statusOf(id)).toBe("reworking");
  });

  it("expirePendingPosts skips needs_new_time", async () => {
    const held = await post(brandA, "pending_approval", "now() - interval '1 hour'", true);
    const plain = await post(brandA, "pending_approval", "now() - interval '1 hour'");
    await expirePendingPosts(db);
    expect(await statusOf(held)).toBe("pending_approval");
    expect(await statusOf(plain)).toBe("expired");
  });

  it("expireMissedApprovedPosts skips brands without a publisher", async () => {
    const pub = await seedTestBrand(db, { slug: "brand-pub", publisher: "postiz" });
    const a = await post(brandA, "approved", "now() - interval '7 hours'");
    const b = await post(pub, "approved", "now() - interval '7 hours'");
    await expireMissedApprovedPosts(db);
    expect(await statusOf(a)).toBe("approved");
    expect(await statusOf(b)).toBe("expired");
  });

  it("claimDuePosts ignores reworking posts", async () => {
    const pub = await seedTestBrand(db, { slug: "brand-pub", publisher: "postiz" });
    const id = await post(pub, "reworking", "now() - interval '1 minute'");
    expect(await claimDuePosts(db, 10)).toEqual([]);
    expect(await statusOf(id)).toBe("reworking");
  });

  it("hasCorePostOnLocalDate counts reworking posts", async () => {
    await post(brandA, "reworking", "now() + interval '1 day'");
    const [d] = await db.query<{ d: string }>("select ((now() + interval '1 day') at time zone 'Europe/Brussels')::date::text as d");
    expect(await hasCorePostOnLocalDate(db, brandA, "Europe/Brussels", d.d)).toBe(true);
  });

  it("getPlannedPosts includes reworking posts", async () => {
    const id = await post(brandA, "reworking", "now() + interval '1 day'");
    const rows = await getPlannedPosts(db, brandA, new Date(Date.now() - 86400e3), new Date(Date.now() + 5 * 86400e3));
    expect(rows.map((r) => r.id)).toEqual([id]);
  });

  it("claimNextRun prefers revise runs", async () => {
    await enqueueRun(db, brandA, "weekly_plan", "2026-W43");
    const revise = await enqueueRun(db, brandA, "revise", randomUUID());
    expect((await claimNextRun(db))?.id).toBe(revise);
  });

  it("members can read their brand's versions, revisions and insights; strangers see none", async () => {
    const stranger = "99999999-9999-9999-9999-999999999999";
    for (const b of [brandA, brandB]) {
      const p = await post(b, "pending_approval", "now()");
      const [v] = await db.query<{ id: string }>(
        `insert into post_versions (post_id, brand_id, caption, hashtags, media, planned_at, reason)
         values ($1,$2,'c','{}','[]',now(),'redo') returning id`, [p, b]);
      await db.query(
        `insert into post_revisions (post_id, brand_id, requested_by, feedback, prior_status, version_id)
         values ($1,$2,$3,'f','pending_approval',$4)`, [p, b, alice, v.id]);
      await db.query("insert into brand_insights (brand_id, week_key, body) values ($1,'2026-W43','b')", [b]);
    }
    for (const t of ["post_versions", "post_revisions", "brand_insights"]) {
      const rows = await asUser(alice, () => db.query<{ brand_id: string }>(`select brand_id from ${t}`));
      expect(rows.map((r) => r.brand_id)).toEqual([brandA]);
      expect(await asUser(stranger, () => db.query(`select * from ${t}`))).toEqual([]);
    }
  });
});
