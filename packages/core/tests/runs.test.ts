import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedTestBrand } from "../src/testing.js";
import type { Db } from "../src/db.js";
import { enqueueRun, claimNextRun, claimRunById, recoverStaleRuns, finishRun, heartbeatRun, requeueRun } from "../src/repo/runs.js";

let db: Db;
let brand: string;
beforeEach(async () => { ({ db } = await createTestDb()); brand = await seedTestBrand(db); });

describe("run queue", () => {
  it("claims the oldest queued run once", async () => {
    const a = await enqueueRun(db, brand, "daily_check", "2026-10-18");
    await enqueueRun(db, brand, "daily_check", "2026-10-19");
    const run = await claimNextRun(db);
    expect(run?.id).toBe(a);
    expect(run?.status).toBe("running");
    expect(run?.attempts).toBe(1);
    expect(await claimRunById(db, a!)).toBeNull(); // already running
  });

  it("re-queues stale runs and fails them after 3 attempts", async () => {
    const id = await enqueueRun(db, brand, "weekly_plan", "2026-W43");
    await claimNextRun(db);
    await db.query("update agent_runs set heartbeat_at = now() - interval '11 minutes' where id = $1", [id]);
    expect(await recoverStaleRuns(db)).toEqual({ requeued: 1, failed: 0, failedRuns: [] });
    await db.query("update agent_runs set status='running', attempts=3, heartbeat_at = now() - interval '11 minutes' where id = $1", [id]);
    const res = await recoverStaleRuns(db);
    expect(res.requeued).toBe(0);
    expect(res.failed).toBe(1);
    expect(res.failedRuns.map((r) => r.id)).toEqual([id]);
    expect(res.failedRuns[0].status).toBe("failed");
  });

  it("does not touch fresh running runs", async () => {
    await enqueueRun(db, brand, "manual", "m1");
    const run = await claimNextRun(db);
    expect(await recoverStaleRuns(db)).toEqual({ requeued: 0, failed: 0, failedRuns: [] });
    expect(await finishRun(db, run!.id, run!.attempts, { status: "succeeded", summary: "ok", inputTokens: 10 })).toBe(true);
    const [row] = await db.query("select status, input_tokens from agent_runs where id = $1", [run!.id]);
    expect(row).toEqual({ status: "succeeded", input_tokens: 10 });
    // a finished run can no longer be heartbeated, re-finished or re-queued
    expect(await heartbeatRun(db, run!.id, run!.attempts)).toBe(false);
    expect(await finishRun(db, run!.id, run!.attempts, { status: "failed", error: "late" })).toBe(false);
    expect(await requeueRun(db, run!.id, run!.attempts, "late")).toBe(false);
  });

  it("heartbeats and re-queues the claimant's own running run", async () => {
    const id = await enqueueRun(db, brand, "manual", "m2");
    const run = await claimNextRun(db);
    await db.query("update agent_runs set heartbeat_at = now() - interval '5 minutes' where id = $1", [id]);
    expect(await heartbeatRun(db, id!, run!.attempts)).toBe(true);
    const [beat] = await db.query<{ fresh: boolean }>(
      "select heartbeat_at > now() - interval '1 minute' as fresh from agent_runs where id = $1", [id]);
    expect(beat.fresh).toBe(true);
    expect(await requeueRun(db, id!, run!.attempts, "boom")).toBe(true);
    const [row] = await db.query("select status, error, heartbeat_at from agent_runs where id = $1", [id]);
    expect(row).toEqual({ status: "queued", error: "boom", heartbeat_at: null });
  });

  it("ignores a stale claimant after its run was recovered and re-claimed", async () => {
    const id = await enqueueRun(db, brand, "daily_check", "2026-10-18");
    const stale = (await claimNextRun(db))!;
    await db.query("update agent_runs set heartbeat_at = now() - interval '11 minutes' where id = $1", [id]);
    await recoverStaleRuns(db);
    const fresh = (await claimNextRun(db))!;
    expect(fresh.id).toBe(id);
    expect(fresh.attempts).toBe(2);
    await db.query("update agent_runs set heartbeat_at = now() - interval '5 minutes' where id = $1", [id]);

    expect(await heartbeatRun(db, id!, stale.attempts)).toBe(false);
    expect(await finishRun(db, id!, stale.attempts, { status: "succeeded", summary: "stale" })).toBe(false);
    expect(await requeueRun(db, id!, stale.attempts, "stale error")).toBe(false);
    const [row] = await db.query<{ status: string; summary: string | null; error: string | null; old: boolean }>(
      "select status, summary, error, heartbeat_at < now() - interval '4 minutes' as old from agent_runs where id = $1", [id]);
    expect(row).toEqual({ status: "running", summary: null, error: null, old: true });

    expect(await finishRun(db, id!, fresh.attempts, { status: "succeeded", summary: "fresh" })).toBe(true);
    const [done] = await db.query("select status, summary from agent_runs where id = $1", [id]);
    expect(done).toEqual({ status: "succeeded", summary: "fresh" });
  });
});
