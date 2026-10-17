import type { Db } from "../db.js";

export type RunKind = "weekly_plan" | "daily_check" | "manual";
export type RunStatus = "queued" | "running" | "succeeded" | "failed";
export interface RunRow {
  id: string; brand_id: string; kind: RunKind; period_key: string; status: RunStatus;
  attempts: number; heartbeat_at: Date | null; started_at: Date | null; finished_at: Date | null;
  summary: string | null; error: string | null; created_at: Date;
}

export async function enqueueRun(db: Db, brandId: string, kind: RunKind, periodKey: string): Promise<string | null> {
  const rows = await db.query<{ id: string }>(
    `insert into agent_runs (brand_id, kind, period_key) values ($1, $2, $3)
     on conflict (brand_id, kind, period_key) do nothing returning id`,
    [brandId, kind, periodKey]
  );
  return rows[0]?.id ?? null;
}

const CLAIM_SET = `status = 'running', started_at = now(), heartbeat_at = now(), attempts = attempts + 1, error = null`;

export async function claimNextRun(db: Db): Promise<RunRow | null> {
  const rows = await db.query<RunRow>(
    `update agent_runs set ${CLAIM_SET}
     where id = (select id from agent_runs where status = 'queued' order by created_at
                 for update skip locked limit 1)
     returning *`
  );
  return rows[0] ?? null;
}

export async function claimRunById(db: Db, id: string): Promise<RunRow | null> {
  const rows = await db.query<RunRow>(
    `update agent_runs set ${CLAIM_SET} where id = $1 and status = 'queued' returning *`, [id]);
  return rows[0] ?? null;
}

// Writes by a run's claimant are guarded by the attempt number it claimed: once a stalled run is
// recovered and re-claimed (attempts + 1), the old claimant can no longer heartbeat, finish or re-queue it.
const OWNED = `id = $1 and status = 'running' and attempts = $2`;

export async function heartbeatRun(db: Db, id: string, claimedAttempts: number): Promise<boolean> {
  const rows = await db.query(`update agent_runs set heartbeat_at = now() where ${OWNED} returning id`, [id, claimedAttempts]);
  return rows.length > 0;
}

export async function finishRun(
  db: Db, id: string, claimedAttempts: number,
  r: { status: "succeeded" | "failed"; summary?: string | null; error?: string | null; inputTokens?: number; outputTokens?: number; imageCount?: number }
): Promise<boolean> {
  const rows = await db.query(
    `update agent_runs set status = $3, finished_at = now(), summary = $4, error = $5,
       input_tokens = $6, output_tokens = $7, image_count = $8 where ${OWNED} returning id`,
    [id, claimedAttempts, r.status, r.summary ?? null, r.error ?? null, r.inputTokens ?? 0, r.outputTokens ?? 0, r.imageCount ?? 0]
  );
  return rows.length > 0;
}

export async function requeueRun(db: Db, id: string, claimedAttempts: number, error: string): Promise<boolean> {
  const rows = await db.query(
    `update agent_runs set status = 'queued', error = $3, heartbeat_at = null where ${OWNED} returning id`,
    [id, claimedAttempts, error]
  );
  return rows.length > 0;
}

export async function recoverStaleRuns(
  db: Db, opts: { staleMinutes?: number; maxAttempts?: number } = {}
): Promise<{ requeued: number; failed: number; failedRuns: RunRow[] }> {
  const rows = await db.query<RunRow>(
    `update agent_runs
       set status = case when attempts >= $2 then 'failed' else 'queued' end,
           error = 'worker heartbeat lost', finished_at = case when attempts >= $2 then now() else null end
     where status = 'running' and heartbeat_at < now() - make_interval(mins => $1)
     returning *`,
    [opts.staleMinutes ?? 10, opts.maxAttempts ?? 3]
  );
  const failedRuns = rows.filter((r) => r.status === "failed");
  return {
    requeued: rows.filter((r) => r.status === "queued").length,
    failed: failedRuns.length,
    failedRuns,
  };
}
