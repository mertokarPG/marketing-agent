import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import { MemoryStorage, enqueueRun, claimNextRun, recoverStaleRuns, type Db } from "@carepost/core";
import { createTestDb, seedTestBrand } from "@carepost/core/testing";
import { executeRun, runLoopTick, type RunDeps } from "../../src/runtime/run-loop.js";

let db: Db;
let brandId: string;
let deps: RunDeps;
let ingestMetrics: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  ({ db } = await createTestDb());
  brandId = await seedTestBrand(db, { publisher: "postiz" });
  await db.query("insert into brand_sources (brand_id, source) values ($1, $2::jsonb)", [brandId, JSON.stringify({ id: "hn" })]);
  ingestMetrics = vi.fn().mockResolvedValue(undefined);
  deps = {
    db, storage: new MemoryStorage(), tmpRoot: os.tmpdir(),
    agent: vi.fn().mockResolvedValue({ summary: "done", inputTokens: 100, outputTokens: 20, imageCount: 2 }),
    scrape: vi.fn().mockResolvedValue([]),
    publisherFor: () => ({ name: "postiz", publish: vi.fn(), ingestMetrics }),
    notify: vi.fn().mockResolvedValue("ok"),
    now: () => new Date("2026-10-18T07:30:00Z"),
    heartbeatMs: 60_000,
  };
});
const runRow = async () => (await db.query("select * from agent_runs"))[0];

describe("executeRun", () => {
  it("scrapes, ingests metrics, runs the agent and records usage", async () => {
    await enqueueRun(db, brandId, "weekly_plan", "2026-W43");
    await executeRun(deps, (await claimNextRun(db))!);
    expect(deps.scrape).toHaveBeenCalledWith(db, brandId, [{ id: "hn" }]);
    const opts = (deps.agent as any).mock.calls[0][2];
    expect(opts).toMatchObject({ kind: "weekly_plan", periodKey: "2026-W43" });
    expect(opts.toolContext.window.start.toISOString()).toBe("2026-10-18T22:00:00.000Z");
    expect(await runRow()).toMatchObject({ status: "succeeded", summary: "done", input_tokens: 100, output_tokens: 20, image_count: 2 });
    const brandDir = (deps.agent as any).mock.calls[0][0].brandDir;
    expect(fs.existsSync(brandDir)).toBe(false); // temp dir cleaned up
  });

  it("calls publisher.ingestMetrics exactly once with the brand and db", async () => {
    await enqueueRun(db, brandId, "daily_check", "2026-10-18");
    await executeRun(deps, (await claimNextRun(db))!);
    expect(ingestMetrics).toHaveBeenCalledTimes(1);
    const [brand, passedDb] = ingestMetrics.mock.calls[0];
    expect(brand.dbId).toBe(brandId);
    expect(brand).toBe((deps.agent as any).mock.calls[0][0]);
    expect(passedDb).toBe(db);
  });

  it("continues when metrics ingest fails", async () => {
    ingestMetrics.mockRejectedValue(new Error("postiz 500"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await enqueueRun(db, brandId, "daily_check", "2026-10-18");
    await executeRun(deps, (await claimNextRun(db))!);
    expect(deps.agent).toHaveBeenCalledTimes(1);
    expect((await runRow()).status).toBe("succeeded");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("metrics ingest failed"));
    warn.mockRestore();
  });

  it("continues when scraping fails", async () => {
    deps.scrape = vi.fn().mockRejectedValue(new Error("feed down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await enqueueRun(db, brandId, "daily_check", "2026-10-18");
    await executeRun(deps, (await claimNextRun(db))!);
    expect((await runRow()).status).toBe("succeeded");
    warn.mockRestore();
  });

  it("re-queues on agent error until the last attempt, then fails and notifies", async () => {
    deps.agent = vi.fn().mockRejectedValue(new Error("anthropic 529"));
    await enqueueRun(db, brandId, "daily_check", "2026-10-18");
    await executeRun(deps, (await claimNextRun(db))!);
    expect(await runRow()).toMatchObject({ status: "queued", error: "anthropic 529" });
    await executeRun(deps, (await claimNextRun(db))!);
    await executeRun(deps, (await claimNextRun(db))!);
    expect(await runRow()).toMatchObject({ status: "failed", attempts: 3 });
    expect(deps.notify).toHaveBeenCalledTimes(1);
    const [subject, body, to] = (deps.notify as any).mock.calls[0];
    expect(subject).toBe("Run failed: daily_check 2026-10-18");
    expect(body).toContain("anthropic 529");
    expect(to).toBeUndefined(); // no recipients → platform owner
  });

  it("still marks the run failed when the owner notification rejects", async () => {
    deps.agent = vi.fn().mockRejectedValue(new Error("anthropic 529"));
    deps.notify = vi.fn().mockRejectedValue(new Error("smtp down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await enqueueRun(db, brandId, "daily_check", "2026-10-18");
    await executeRun(deps, (await claimNextRun(db))!);
    await executeRun(deps, (await claimNextRun(db))!);
    await expect(executeRun(deps, (await claimNextRun(db))!)).resolves.toBeUndefined();
    expect(await runRow()).toMatchObject({ status: "failed", attempts: 3, error: "anthropic 529" });
    expect(deps.notify).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("failure notification failed"));
    warn.mockRestore();
  });

  it("removes the temp brand dir and re-queues when the agent throws", async () => {
    deps.agent = vi.fn().mockRejectedValue(new Error("anthropic 529"));
    await enqueueRun(db, brandId, "daily_check", "2026-10-18");
    await executeRun(deps, (await claimNextRun(db))!);
    const brandDir = (deps.agent as any).mock.calls[0][0].brandDir;
    expect(fs.existsSync(brandDir)).toBe(false);
    expect(await runRow()).toMatchObject({ status: "queued", attempts: 1, error: "anthropic 529" });
  });

  it("heartbeats while the agent is running", async () => {
    const id = await enqueueRun(db, brandId, "daily_check", "2026-10-18");
    const run = (await claimNextRun(db))!;
    await db.query("update agent_runs set heartbeat_at = now() - interval '5 minutes' where id = $1", [id]);
    deps.heartbeatMs = 10;
    deps.agent = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 100));
      return { summary: "done", inputTokens: 0, outputTokens: 0, imageCount: 0 };
    });
    await executeRun(deps, run);
    const [row] = await db.query<{ fresh: boolean }>(
      "select heartbeat_at > now() - interval '1 minute' as fresh from agent_runs where id = $1", [id]);
    expect(row.fresh).toBe(true);
  });

  it("a stalled worker whose run was recovered and re-claimed does not touch the new claim", async () => {
    const id = await enqueueRun(db, brandId, "daily_check", "2026-10-18");
    const stale = (await claimNextRun(db))!;
    await db.query("update agent_runs set heartbeat_at = now() - interval '11 minutes' where id = $1", [id]);
    await recoverStaleRuns(db);
    const fresh = (await claimNextRun(db))!;
    expect(fresh.attempts).toBe(2);
    await db.query("update agent_runs set heartbeat_at = now() - interval '5 minutes' where id = $1", [id]);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    deps.heartbeatMs = 10;
    deps.agent = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return { summary: "stale result", inputTokens: 1, outputTokens: 1, imageCount: 0 };
    });
    await expect(executeRun(deps, stale)).resolves.toBeUndefined();
    const [row] = await db.query<{ status: string; summary: string | null; attempts: number; old: boolean }>(
      "select status, summary, attempts, heartbeat_at < now() - interval '4 minutes' as old from agent_runs where id = $1", [id]);
    expect(row).toEqual({ status: "running", summary: null, attempts: 2, old: true });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("no longer owns"));

    // the stale worker failing on its last attempt must not mark the new claim failed nor notify
    deps.agent = vi.fn().mockRejectedValue(new Error("boom"));
    deps.maxAttempts = 1; // the stale claim was its last attempt → failure path
    await executeRun(deps, stale);
    expect((await runRow()).status).toBe("running");
    expect(deps.notify).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("runLoopTick", () => {
  it("recovers a crashed run and executes it", async () => {
    const id = await enqueueRun(db, brandId, "daily_check", "2026-10-18");
    await claimNextRun(db);
    await db.query("update agent_runs set heartbeat_at = now() - interval '11 minutes' where id = $1", [id]);
    expect(await runLoopTick(deps)).toBe(true);
    expect(await runRow()).toMatchObject({ status: "succeeded", attempts: 2 });
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it("notifies the owner for each stale run recovery moved to failed", async () => {
    const id = await enqueueRun(db, brandId, "weekly_plan", "2026-W43");
    await claimNextRun(db);
    await db.query("update agent_runs set attempts = 3, heartbeat_at = now() - interval '11 minutes' where id = $1", [id]);
    expect(await runLoopTick(deps)).toBe(false);
    expect(await runRow()).toMatchObject({ status: "failed", error: "worker heartbeat lost" });
    expect(deps.notify).toHaveBeenCalledTimes(1);
    const [subject, body, to] = (deps.notify as any).mock.calls[0];
    expect(subject).toBe("Run failed: weekly_plan 2026-W43");
    expect(body).toContain(`Run ${id} for brand ${brandId} failed after 3 attempts`);
    expect(body).toContain("worker heartbeat lost");
    expect(to).toBeUndefined();
    expect(deps.agent).not.toHaveBeenCalled();
  });

  it("returns false when the queue is empty", async () => {
    expect(await runLoopTick(deps)).toBe(false);
  });
});
