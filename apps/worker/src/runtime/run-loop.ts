import {
  claimNextRun, finishRun, heartbeatRun, listBrandSources, recoverStaleRuns, requeueRun, sweepStuckRevisions,
  type BrandConfig, type Db, type RunRow, type StorageClient,
} from "@carepost/core";
import type { RunAgentOptions, RunAgentResult } from "../orchestrator.js";
import type { Publisher } from "../publishers/types.js";
import { materializeBrand } from "./materialize.js";
import { assertRevised, failRevision, prepareRevision, revisionDone, type ReviseBriefContext } from "./revise.js";
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
  let warnedBeatError = false;
  const beat = setInterval(() => {
    void heartbeatRun(db, run.id, run.attempts).then((owned) => {
      if (!owned && !warnedBeat) { warnedBeat = true; lostClaim(run, "heartbeat"); }
    }, (e) => {
      if (!warnedBeatError) { warnedBeatError = true; console.warn(`[run ${run.id}] heartbeat failed: ${msg(e)}`); }
    });
  }, deps.heartbeatMs ?? 30_000);
  let cleanup: (() => Promise<void>) | null = null;
  try {
    const m = await materializeBrand(db, deps.storage, run.brand_id, deps.tmpRoot);
    cleanup = m.cleanup;
    const brand = m.brand;
    const revise = run.kind === "revise";

    let reviseContext: ReviseBriefContext | undefined;
    if (revise) {
      // A redo reworks one post: no scraping or metrics ingest, the user is waiting.
      const prep = await prepareRevision(db, deps.storage, brand, run.period_key);
      if (prep.status !== "ready") {
        // Finished elsewhere (e.g. revised before a lost heartbeat, or swept): nothing to run.
        const owned = await finishRun(db, run.id, run.attempts, prep.status === "done"
          ? { status: "succeeded", summary: "revision already done" }
          : { status: "failed", error: "revision already failed" });
        if (!owned) lostClaim(run, prep.status === "done" ? "success" : "failure");
        return;
      }
      reviseContext = prep.context;
    } else {
      try { await deps.scrape(db, brand.dbId, await listBrandSources(db, brand.dbId)); }
      catch (e) { console.warn(`[run ${run.id}] scrape failed (continuing): ${msg(e)}`); }

      const publisher = deps.publisherFor(brand);
      if (publisher?.ingestMetrics) {
        try { await publisher.ingestMetrics(brand, db); }
        catch (e) { console.warn(`[run ${run.id}] metrics ingest failed (continuing): ${msg(e)}`); }
      }
    }

    const now = deps.now();
    const result = await deps.agent(brand, db, {
      kind: run.kind, periodKey: run.period_key, now, mode: revise ? "revise" : "plan", revise: reviseContext,
      toolContext: {
        storage: deps.storage, runId: run.id, kind: run.kind, periodKey: run.period_key,
        window: runWindow(brand, run.kind, run.period_key, now),
        notify: (s, b, to) => deps.notify(s, b, to),
      },
    });
    if (revise) await assertRevised(db, run.period_key);
    const owned = await finishRun(db, run.id, run.attempts, {
      status: "succeeded", summary: result.summary, inputTokens: result.inputTokens,
      outputTokens: result.outputTokens, imageCount: result.imageCount,
    });
    if (!owned) lostClaim(run, "success");
  } catch (e) {
    // The post was already revised (e.g. the agent errored after revise_post): the redo is done, so is the run.
    if (run.kind === "revise" && (await revisionDone(db, run.period_key))) {
      const owned = await finishRun(db, run.id, run.attempts, { status: "succeeded", summary: `revised; then: ${msg(e)}` });
      if (!owned) lostClaim(run, "success");
    } else if (run.attempts < (deps.maxAttempts ?? 3)) {
      if (!(await requeueRun(db, run.id, run.attempts, msg(e)))) lostClaim(run, "re-queue");
    } else if (await finishRun(db, run.id, run.attempts, { status: "failed", error: msg(e) })) {
      if (run.kind === "revise") await failRevision(db, run.period_key, msg(e));
      try { await notifyRunFailed(deps, run, msg(e)); }
      catch (ne) { console.warn(`[run ${run.id}] failure notification failed: ${msg(ne)}`); }
    } else {
      lostClaim(run, "failure");
    }
  } finally {
    clearInterval(beat);
    if (cleanup) {
      try { await cleanup(); }
      catch (e) { console.warn(`[run ${run.id}] temp dir cleanup failed: ${msg(e)}`); }
    }
  }
}

export async function runLoopTick(deps: RunDeps): Promise<boolean> {
  const { failedRuns } = await recoverStaleRuns(deps.db, { maxAttempts: deps.maxAttempts ?? 3 });
  for (const r of failedRuns) {
    if (r.kind === "revise") await failRevision(deps.db, r.period_key, r.error ?? "worker heartbeat lost");
    try { await notifyRunFailed(deps, r, r.error ?? "worker heartbeat lost"); }
    catch (e) { console.warn(`[run ${r.id}] failure notification failed: ${msg(e)}`); }
  }
  try { await sweepStuckRevisions(deps.db); }
  catch (e) { console.warn(`stuck revision sweep failed: ${msg(e)}`); }
  const run = await claimNextRun(deps.db);
  if (!run) return false;
  await executeRun(deps, run);
  return true;
}
