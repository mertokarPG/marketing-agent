import type { Db } from "../db.js";

export type RevisionStatus = "queued" | "running" | "done" | "failed";
export interface RevisionRow {
  id: string; post_id: string; brand_id: string; requested_by: string; feedback: string;
  prior_status: string; version_id: string; status: RevisionStatus; error: string | null;
  created_at: Date; finished_at: Date | null;
}

export async function getRevision(db: Db, id: string): Promise<RevisionRow | null> {
  const rows = await db.query<RevisionRow>("select * from post_revisions where id = $1", [id]);
  return rows[0] ?? null;
}

/** Moves a revision forward. A done revision is final: it is never re-run or marked failed. */
export async function markRevision(
  db: Db, id: string, status: "running" | "done" | "failed", error?: string
): Promise<void> {
  const from = status === "running" ? ["queued", "running"] : status === "done" ? ["running"] : ["queued", "running", "failed"];
  await db.query(
    `update post_revisions set status = $2, error = $3,
       finished_at = case when $2 = 'running' then null else coalesce(finished_at, now()) end
     where id = $1 and status = any($4::text[])`,
    [id, status, status === "failed" ? (error ?? "revision failed") : null, from]);
}

/**
 * Puts the post back the way it was before the redo (the revision's snapshot, and its prior status) and marks the
 * revision failed. Safe to call more than once: it only touches a post that is still reworking for this revision
 * (not one reworking for a newer revision), and never undoes a revision that finished.
 */
export async function restoreAfterFailedRevision(db: Db, revisionId: string): Promise<void> {
  await db.query(
    `update posts p set caption = v.caption, hashtags = v.hashtags, media = v.media, status = r.prior_status,
       last_changed_by = null, last_changed_at = now()
     from post_revisions r join post_versions v on v.id = r.version_id
     where r.id = $1 and r.status <> 'done' and p.id = r.post_id and p.status = 'reworking'
       and not exists (select 1 from post_revisions newer
                       where newer.post_id = r.post_id and newer.created_at > r.created_at)`,
    [revisionId]);
  await db.query(
    `update post_revisions set status = 'failed', error = coalesce(error, 'revision failed'), finished_at = coalesce(finished_at, now())
     where id = $1 and status in ('queued','running')`,
    [revisionId]);
}

/**
 * A paused brand's queued revise runs are never claimed, so its redos would stay reworking forever. Fails the
 * queued revise runs of paused brands whose revision is older than `olderThanMinutes`, and restores their posts.
 */
export async function sweepStuckRevisions(db: Db, olderThanMinutes = 10): Promise<number> {
  const runs = await db.query<{ period_key: string }>(
    `update agent_runs ar set status = 'failed', finished_at = now(), error = 'brand paused; redo cancelled'
     from post_revisions r join brands b on b.id = r.brand_id
     where ar.kind = 'revise' and ar.status = 'queued' and ar.period_key = r.id::text
       and b.status <> 'active' and r.status = 'queued'
       and r.created_at < now() - make_interval(mins => $1)
     returning ar.period_key`,
    [olderThanMinutes]);
  for (const r of runs) {
    await restoreAfterFailedRevision(db, r.period_key);
    await markRevision(db, r.period_key, "failed", "brand paused; redo cancelled");
  }
  return runs.length;
}
