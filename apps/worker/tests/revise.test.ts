import { describe, it, expect, vi, beforeEach } from "vitest";
import os from "node:os";
import type { PGlite } from "@electric-sql/pglite";
import {
  MemoryStorage, claimNextRun, enqueueRun, getRevision, recoverStaleRuns, type BrandConfig, type Db,
} from "@carepost/core";
import { createTestDb, seedTestBrand, addTestMember } from "@carepost/core/testing";
import { executeRun, runLoopTick, type RunDeps } from "../src/runtime/run-loop.js";
import { revisePost } from "../src/tools/revise-post.js";
import { buildTools, type RunAgentOptions } from "../src/orchestrator.js";
import { buildBrief } from "../src/runtime/windows.js";
import type { ToolContext } from "../src/runtime/types.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

let db: Db;
let pg: PGlite;
let brandId: string;
let owner: string;
let storage: MemoryStorage;
let deps: RunDeps;

const ok = { summary: "revised", inputTokens: 1, outputTokens: 1, imageCount: 0 };

/** A fake agent that does what the real one is told to: one revise_post call, reusing the current slide. */
function revisingAgent(caption = "New playful caption") {
  return vi.fn(async (brand: BrandConfig, d: Db, opts: RunAgentOptions) => {
    const rev = (await getRevision(d, opts.periodKey))!;
    const slides = opts.revise!.slides;
    const first = await revisePost(d, brand, opts.toolContext, rev,
      { caption, hashtags: ["#new"], images: [slides[0]], rationale: "more playful" });
    const second = await revisePost(d, brand, opts.toolContext, rev,
      { caption: "again", hashtags: [], images: [slides[0]], rationale: "x" });
    return { ...ok, summary: `${first} | ${second}` };
  });
}

beforeEach(async () => {
  ({ db, pg } = await createTestDb());
  brandId = await seedTestBrand(db, { publisher: "postiz" });
  owner = await addTestMember(db, brandId, "owner@kuanyin.be", "owner");
  storage = new MemoryStorage();
  deps = {
    db, storage, tmpRoot: os.tmpdir(),
    agent: revisingAgent(),
    scrape: vi.fn().mockResolvedValue([]),
    publisherFor: () => null,
    notify: vi.fn().mockResolvedValue("ok"),
    now: () => new Date(),
    heartbeatMs: 60_000,
  };
});

async function post(o: { status?: string; brand?: string } = {}): Promise<string> {
  const b = o.brand ?? brandId;
  const [r] = await db.query<{ id: string }>(
    `insert into posts (brand_id, kind, status, planned_at, caption, hashtags, media, rationale)
     values ($1, 'core', $2, now() + interval '2 days', 'original caption', '{"#old"}', $3::jsonb, 'orig')
     returning id`,
    [b, o.status ?? "approved", JSON.stringify([{ storage_path: `${b}/p/0.png` }])]);
  await storage.upload("post-media", `${b}/p/0.png`, PNG, "image/png");
  return r.id;
}

async function redo(postId: string, feedback = "more playful", user = owner): Promise<string> {
  await pg.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
  try {
    const [r] = await db.query<{ id: string }>("select request_post_redo($1, $2) as id", [postId, feedback]);
    return r.id;
  } finally {
    await pg.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

const getPost = async (id: string) => (await db.query<any>("select * from posts where id = $1", [id]))[0];
const runFor = async (revisionId: string) =>
  (await db.query<any>("select * from agent_runs where kind = 'revise' and period_key = $1", [revisionId]))[0];

describe("revise runs", () => {
  it("revise run updates the post and returns it for review", async () => {
    const id = await post({ status: "approved" });
    const rev = await redo(id);
    expect((await getPost(id)).status).toBe("reworking");

    const run = (await claimNextRun(db))!;
    expect(run.kind).toBe("revise");
    await executeRun(deps, run);

    const opts = (deps.agent as any).mock.calls[0][2] as RunAgentOptions;
    expect(opts.mode).toBe("revise");
    expect(deps.scrape).not.toHaveBeenCalled();

    const p = await getPost(id);
    expect(p).toMatchObject({ status: "pending_approval", caption: "New playful caption", hashtags: ["#new"],
      rationale: "more playful", needs_new_time: false, last_changed_by: null });
    expect(p.last_changed_at).not.toBeNull();
    expect(p.media).toEqual([{ storage_path: `${brandId}/${id}/r1-0.png` }]);
    expect(storage.files.has(`post-media/${brandId}/${id}/r1-0.png`)).toBe(true);
    expect((await getRevision(db, rev))!.status).toBe("done");
    expect((await runFor(rev)).status).toBe("succeeded");
    // one successful call per run: the second call was rejected
    expect((await runFor(rev)).summary).toMatch(/\| revise_post rejected/);
  });

  it("late revise sets needs_new_time", async () => {
    const id = await post();
    await redo(id);
    await db.query("update posts set planned_at = now() + interval '5 minutes' where id = $1", [id]);
    await executeRun(deps, (await claimNextRun(db))!);
    expect(await getPost(id)).toMatchObject({ status: "pending_approval", needs_new_time: true });
  });

  it("failed revise run restores the post", async () => {
    const id = await post({ status: "approved" });
    const rev = await redo(id);
    await db.query("update posts set caption = 'half-done' where id = $1", [id]);
    deps.agent = vi.fn().mockRejectedValue(new Error("anthropic 529"));
    for (let i = 0; i < 3; i++) await executeRun(deps, (await claimNextRun(db))!);
    expect((await runFor(rev)).status).toBe("failed");
    expect(await getPost(id)).toMatchObject({ status: "approved", caption: "original caption", hashtags: ["#old"] });
    expect((await getRevision(db, rev))!).toMatchObject({ status: "failed", error: "anthropic 529" });
  });

  it("a revise run whose agent never calls revise_post fails and restores", async () => {
    const id = await post({ status: "pending_approval" });
    const rev = await redo(id);
    deps.agent = vi.fn().mockResolvedValue(ok);
    deps.maxAttempts = 1;
    await executeRun(deps, (await claimNextRun(db))!);
    expect(await runFor(rev)).toMatchObject({ status: "failed", error: "agent did not revise the post" });
    expect((await getPost(id)).status).toBe("pending_approval");
  });

  it("failed revise run restores the post when recoverStaleRuns fails it", async () => {
    const id = await post({ status: "approved" });
    const rev = await redo(id);
    const run = (await claimNextRun(db))!;
    await db.query("update agent_runs set attempts = 3, heartbeat_at = now() - interval '11 minutes' where id = $1", [run.id]);
    await db.query("update post_revisions set status = 'running' where id = $1", [rev]);
    expect(await runLoopTick(deps)).toBe(false);
    expect((await runFor(rev)).status).toBe("failed");
    expect(await getPost(id)).toMatchObject({ status: "approved", caption: "original caption" });
    expect((await getRevision(db, rev))!.status).toBe("failed");
  });

  it("restoreAfterFailedRevision is idempotent and leaves a non-reworking post alone", async () => {
    const { restoreAfterFailedRevision } = await import("@carepost/core");
    const id = await post({ status: "approved" });
    const rev = await redo(id);
    await restoreAfterFailedRevision(db, rev);
    await db.query("update posts set caption = 'edited after restore' where id = $1", [id]);
    await restoreAfterFailedRevision(db, rev);
    expect(await getPost(id)).toMatchObject({ status: "approved", caption: "edited after restore" });
    expect((await getRevision(db, rev))!.status).toBe("failed");
  });

  it("revise runs are claimed before weekly plans", async () => {
    await enqueueRun(db, brandId, "weekly_plan", "2026-W43");
    const id = await post();
    const rev = await redo(id);
    expect(await runLoopTick(deps)).toBe(true);
    expect((await runFor(rev)).status).toBe("succeeded");
    const [weekly] = await db.query<any>("select status from agent_runs where kind = 'weekly_plan'");
    expect(weekly.status).toBe("queued");
  });

  it("paused brand redo is swept back", async () => {
    const id = await post({ status: "approved" });
    const rev = await redo(id);
    await db.query("update brands set status = 'paused' where id = $1", [brandId]);
    await db.query("update post_revisions set created_at = now() - interval '11 minutes' where id = $1", [rev]);
    expect(await runLoopTick(deps)).toBe(false);
    expect(deps.agent).not.toHaveBeenCalled();
    expect(await getPost(id)).toMatchObject({ status: "approved", caption: "original caption" });
    expect((await getRevision(db, rev))!.status).toBe("failed");
    expect((await runFor(rev)).status).toBe("failed");
  });

  it("a recent paused-brand redo is not swept yet", async () => {
    const id = await post();
    await redo(id);
    await db.query("update brands set status = 'paused' where id = $1", [brandId]);
    await runLoopTick(deps);
    expect((await getPost(id)).status).toBe("reworking");
  });
});

describe("revise tools and brief", () => {
  const ctx = (): ToolContext => ({
    storage: new MemoryStorage(), runId: null, kind: "revise", periodKey: "r",
    window: { start: new Date(), end: new Date(Date.now() + 86400_000) }, notify: async () => "",
  });
  const brand = {
    id: "b", name: "Kuanyin Skin", timezone: "Europe/Brussels", dbId: "00000000-0000-4000-8000-000000000001",
    postingSchedule: { coreDays: ["mon"], defaultTime: "10:00" }, productPhotos: [], brandDir: "/tmp/b",
    imageGeneration: { enabled: true, provider: "carephoto", defaultModel: "nano-banana-2", defaultAspectRatio: "4:5" },
    promptBankPath: "/tmp/prompts.json",
  } as unknown as BrandConfig;

  it("revise mode has no save_post and has revise_post", () => {
    const names = buildTools(brand, db, ctx(), "revise").map((t: any) => t.name);
    expect(names).toContain("revise_post");
    for (const n of ["save_post", "get_planned_posts", "scrape_competitor", "search_trends", "get_hot_topics", "get_trending_topics", "save_learnings"])
      expect(names).not.toContain(n);
    for (const n of ["generate_image", "compose_image_prompt", "browse_prompt_bank"]) expect(names).toContain(n);
    const plan = buildTools(brand, db, { ...ctx(), kind: "weekly_plan" }).map((t: any) => t.name);
    expect(plan).toContain("save_post");
    expect(plan).toContain("save_learnings");
    expect(plan).not.toContain("revise_post");
    const daily = buildTools(brand, db, { ...ctx(), kind: "daily_check" }).map((t: any) => t.name);
    expect(daily).not.toContain("save_learnings");
  });

  it("the revise brief carries the post and the feedback verbatim", () => {
    const brief = buildBrief(brand, "revise", "rev-1", new Date("2026-10-18T07:00:00Z"), undefined, {
      feedback: "more playful, and use the rose oil photo", caption: "Barrier care 101", hashtags: ["#skin", "#care"],
      slides: ["/tmp/b/current-slides/1.png", "/tmp/b/current-slides/2.png"], plannedAt: new Date("2026-10-20T08:00:00Z"),
    });
    expect(brief).toContain("more playful, and use the rose oil photo");
    expect(brief).toContain("Barrier care 101");
    expect(brief).toContain("#skin #care");
    expect(brief).toContain("2 slides");
    expect(brief).toContain("/tmp/b/current-slides/2.png");
    expect(brief).toMatch(/keep (its|the) date and time unless the feedback asks otherwise/i);
    expect(brief).toMatch(/revise_post exactly once/);
  });

  it("the weekly brief asks for save_learnings", () => {
    const brief = buildBrief(brand, "weekly_plan", "2026-W43", new Date("2026-10-18T07:00:00Z"));
    expect(brief).toContain("save_learnings");
  });
});
