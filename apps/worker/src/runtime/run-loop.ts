import {
  claimNextRun, finishRun, heartbeatRun, listBrandSources, recoverStaleRuns, requeueRun,
  type BrandConfig, type Db, type RunRow, type StorageClient,
} from "@carepost/core";
import type { RunAgentOptions, RunAgentResult } from "../orchestrator.js";
import type { Publisher } from "../publishers/types.js";
import { materializeBrand } from "./materialize.js";
import { runWindow } from "./windows.js";

export interface RunDeps {
  db: Db;
  storage: StorageClient;
  tmpRoot: string;
  agent: (brand: BrandConfig, db: Db, opts: RunAgentOptions) => Promise<RunAgentResult>;
  scrape: (db: Db, brandId: string, sources: any[]) => Promise<unknown>;
  publisherFor: (brand: BrandConfig) => Publisher | null;
  /** With no `to`, emails the platform owner (main.ts falls back to OWNER_EMAIL). */
  notify: (subject: string, body: string, to?: string[]) => Promise<unknown>;
  now: () => Date;
  heartbeatMs?: number;
  maxAttempts?: number;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function notifyRunFailed(deps: RunDeps, run: RunRow, error: string): Promise<unknown> {
  return deps.notify(
    `Run failed: ${run.kind} ${run.period_key}`,
    `Run ${run.id} for brand ${run.brand_id} failed after ${run.attempts} attempts:\n${error}`,
  );
}

const lostClaim = (run: RunRow, action: string) =>
  console.warn(`[run ${run.id}] worker no longer owns attempt ${run.attempts} (recovered by another worker); ${action} ignored`);

export async function executeRun(deps: RunDeps, run: RunRow): Promise<void> {
  const { db } = deps;
  let warnedBeat = false;
  const beat = setInterval(() => {
    void heartbeatRun(db, run.id, run.attempts).then((owned) => {
      if (!owned && !warnedBeat) { warnedBeat = true; lostClaim(run, "heartbeat"); }
    }, () => {});
  }, deps.heartbeatMs ?? 30_000);
  let cleanup: (() => Promise<void>) | null = null;
  try {
    const m = await materializeBrand(db, deps.storage, run.brand_id, deps.tmpRoot);
    cleanup = m.cleanup;
    const brand = m.brand;

    try { await deps.scrape(db, brand.dbId, await listBrandSources(db, brand.dbId)); }
    catch (e) { console.warn(`[run ${run.id}] scrape failed (continuing): ${msg(e)}`); }

    const publisher = deps.publisherFor(brand);
    if (publisher?.ingestMetrics) {
      try { await publisher.ingestMetrics(brand, db); }
      catch (e) { console.warn(`[run ${run.id}] metrics ingest failed (continuing): ${msg(e)}`); }
    }

    const now = deps.now();
    const result = await deps.agent(brand, db, {
      kind: run.kind, periodKey: run.period_key, now,
      toolContext: {
        storage: deps.storage, runId: run.id, kind: run.kind,
        window: runWindow(brand, run.kind, run.period_key, now),
        notify: (s, b, to) => deps.notify(s, b, to),
      },
    });
    const owned = await finishRun(db, run.id, run.attempts, {
      status: "succeeded", summary: result.summary, inputTokens: result.inputTokens,
      outputTokens: result.outputTokens, imageCount: result.imageCount,
    });
    if (!owned) lostClaim(run, "success");
  } catch (e) {
    if (run.attempts < (deps.maxAttempts ?? 3)) {
      if (!(await requeueRun(db, run.id, run.attempts, msg(e)))) lostClaim(run, "re-queue");
    } else if (await finishRun(db, run.id, run.attempts, { status: "failed", error: msg(e) })) {
      await notifyRunFailed(deps, run, msg(e));
    } else {
      lostClaim(run, "failure");
    }
  } finally {
    clearInterval(beat);
    if (cleanup) await cleanup();
  }
}

export async function runLoopTick(deps: RunDeps): Promise<boolean> {
  const { failedRuns } = await recoverStaleRuns(deps.db, { maxAttempts: deps.maxAttempts ?? 3 });
  for (const r of failedRuns) {
    try { await notifyRunFailed(deps, r, r.error ?? "worker heartbeat lost"); }
    catch (e) { console.warn(`[run ${r.id}] failure notification failed: ${msg(e)}`); }
  }
  const run = await claimNextRun(deps.db);
  if (!run) return false;
  await executeRun(deps, run);
  return true;
}
