import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedTestBrand, addTestMember } from "../src/testing.js";
import type { Db } from "../src/db.js";
import {
  insertPost, getRecentPosts, getUsedPromptIds, getPlannedPosts, countRunPosts, hasCorePostOnLocalDate,
  expirePendingPosts, claimDuePosts, markPublished, approvePost, setExternalPostId, getPostsWithExternalId,
} from "../src/repo/posts.js";
import { insertAnalytics, getPostPerformance } from "../src/repo/metrics.js";
import { upsertTrend, getTrendsSince, getSourceBaselines } from "../src/repo/trends.js";
import { getBrandNotifyEmails, listActiveBrands } from "../src/repo/brands.js";
import { enqueueRun } from "../src/repo/runs.js";

let db: Db;
let brand: string;
beforeEach(async () => { ({ db } = await createTestDb()); brand = await seedTestBrand(db, { publisher: "postiz" }); });

const base = (o: Partial<Parameters<typeof insertPost>[1]> = {}) => ({
  brand_id: brand, kind: "core" as const, status: "pending_approval" as const,
  planned_at: new Date(Date.now() + 3600_000), caption: "Hello", hashtags: ["#a"],
  media: [{ storage_path: `${brand}/p/0.png` }], prompt_ids: ["p1"], rationale: "why", ...o,
});

describe("posts", () => {
  it("inserts and reads recent posts", async () => {
    const id = await insertPost(db, base());
    const posts = await getRecentPosts(db, brand, 5);
    expect(posts[0]).toMatchObject({ id, caption: "Hello", hashtags: ["#a"], kind: "core" });
    expect(posts[0].media).toEqual([{ storage_path: `${brand}/p/0.png` }]);
    expect(await getUsedPromptIds(db, brand)).toEqual(new Set(["p1"]));
  });

  it("lists planned non-terminal posts in a window", async () => {
    await insertPost(db, base());
    await insertPost(db, base({ status: "rejected" }));
    const rows = await getPlannedPosts(db, brand, new Date(), new Date(Date.now() + 7 * 86400_000));
    expect(rows).toHaveLength(1);
  });

  it("detects a core post on a local date", async () => {
    await insertPost(db, base({ planned_at: new Date("2026-10-19T08:00:00Z") }));
    expect(await hasCorePostOnLocalDate(db, brand, "Europe/Brussels", "2026-10-19")).toBe(true);
    expect(await hasCorePostOnLocalDate(db, brand, "Europe/Brussels", "2026-10-20")).toBe(false);
  });

  it("treats Brussels local-date boundary correctly", async () => {
    await insertPost(db, base({ planned_at: new Date("2026-10-19T22:30:00Z") }));
    expect(await hasCorePostOnLocalDate(db, brand, "Europe/Brussels", "2026-10-19")).toBe(false);
    expect(await hasCorePostOnLocalDate(db, brand, "Europe/Brussels", "2026-10-20")).toBe(true);
  });

  it("does not approve another brand's post", async () => {
    const other = await seedTestBrand(db);
    const id = await insertPost(db, base({ brand_id: other }));
    expect(await approvePost(db, brand, id)).toBe(false);
    const [row] = await db.query("select status from posts where id = $1", [id]);
    expect(row.status).toBe("pending_approval");
    expect(await approvePost(db, other, id)).toBe(true);
  });

  it("counts posts per run", async () => {
    const run = await enqueueRun(db, brand, "daily_check", "2026-10-19");
    await insertPost(db, base({ run_id: run, kind: "timely" }));
    expect(await countRunPosts(db, run!)).toBe(1);
  });

  it("expires late drafts and refuses to approve them", async () => {
    const id = await insertPost(db, base({ planned_at: new Date(Date.now() - 60_000) }));
    expect(await expirePendingPosts(db)).toBe(1);
    expect(await approvePost(db, brand, id)).toBe(false);
    const [row] = await db.query("select status from posts where id = $1", [id]);
    expect(row.status).toBe("expired");
  });

  it("approves a future draft", async () => {
    const id = await insertPost(db, base());
    expect(await approvePost(db, brand, id)).toBe(true);
  });

  it("claims due approved posts only for brands with a publisher", async () => {
    const other = await seedTestBrand(db, { publisher: null });
    const due = await insertPost(db, base({ status: "approved", planned_at: new Date(Date.now() - 1000) }));
    await insertPost(db, { ...base({ status: "approved", planned_at: new Date(Date.now() - 1000) }), brand_id: other });
    await insertPost(db, base({ status: "approved" })); // future
    const claimed = await claimDuePosts(db, 10);
    expect(claimed.map((p) => p.id)).toEqual([due]);
    expect(claimed[0].publisher).toBe("postiz");
    expect(await claimDuePosts(db, 10)).toEqual([]); // now 'publishing'
    await markPublished(db, due, "ext-1");
    const [row] = await db.query("select status, external_post_id from posts where id = $1", [due]);
    expect(row).toEqual({ status: "published", external_post_id: "ext-1" });
  });
});

describe("metrics", () => {
  it("returns the latest snapshot per post with legacy field names", async () => {
    const id = await insertPost(db, base({ status: "published", published_at: new Date("2026-10-01T10:00:00Z") }));
    await setExternalPostId(db, id, "x1");
    expect((await getPostsWithExternalId(db, brand))[0]).toMatchObject({ id, external_post_id: "x1" });
    const m = { post_id: id, brand_id: brand, likes: 1, comments: 0, shares: 0, reach: 5, impressions: 5, views: 9, saves: 0, profile_visits: 0, link_clicks: 0 };
    await insertAnalytics(db, m);
    await db.query("update post_metrics set measured_at = now() - interval '1 day'");
    await insertAnalytics(db, { ...m, likes: 7 });
    const perf = await getPostPerformance(db, brand, 10);
    expect(perf).toHaveLength(1);
    expect(perf[0]).toMatchObject({ post_id: id, likes: 7, content_theme: "core", posted_at: "2026-10-01T10:00:00Z", is_outlier: false });
  });
});

describe("trends", () => {
  it("upserts per brand and normalises dates", async () => {
    await upsertTrend(db, brand, { source_id: "hn", category: "tech", title: "A", url: "https://x/1", score: 10, published_at: "Mon, 19 Oct 2026 08:00:00 GMT" });
    await upsertTrend(db, brand, { source_id: "hn", category: "tech", title: "A2", url: "https://x/1", score: 30, published_at: "not a date" });
    const rows = await getTrendsSince(db, brand, { lookbackHours: 24 * 3650 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: "A2", score: 30 });
    expect(rows[0].published_at).toBe("2026-10-19T08:00:00Z");
    expect((await getSourceBaselines(db, brand)).get("hn")).toEqual({ median: 30, p90: 30 });
  });
});

describe("brands", () => {
  it("lists active brands and emails of all members (incl. viewers)", async () => {
    await seedTestBrand(db, { status: "paused" });
    await addTestMember(db, brand, "owner@example.com", "owner");
    await addTestMember(db, brand, "viewer@example.com", "viewer");
    expect((await listActiveBrands(db)).map((b) => b.id)).toEqual([brand]);
    expect(await getBrandNotifyEmails(db, brand)).toEqual(["owner@example.com", "viewer@example.com"]);
  });
});
