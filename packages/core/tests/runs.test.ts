import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedTestBrand } from "../src/testing.js";
import type { Db } from "../src/db.js";
import { enqueueRun, claimNextRun, claimRunById, recoverStaleRuns, finishRun } from "../src/repo/runs.js";

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
    await finishRun(db, run!.id, { status: "succeeded", summary: "ok", inputTokens: 10 });
    const [row] = await db.query("select status, input_tokens from agent_runs where id = $1", [run!.id]);
    expect(row).toEqual({ status: "succeeded", input_tokens: 10 });
  });
});
