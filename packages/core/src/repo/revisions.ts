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
 * (not one reworking for a newer revision), and never undoes a revision that finished. A post whose time has passed
 * or is within 15 minutes comes back as needs-your-OK with needs_new_time, like a late successful redo, so the
 * version the user asked to change is never published late nor silently expired.
 */
export async function restoreAfterFailedRevision(db: Db, revisionId: string): Promise<void> {
  await db.query(
    `update posts p set caption = v.caption, hashtags = v.hashtags, media = v.media,
       status = case when p.planned_at <= now() + interval '15 minutes' then 'pending_approval' else r.prior_status end,
       needs_new_time = p.needs_new_time or p.planned_at <= now() + interval '15 minutes',
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
 * Makes sure no post stays reworking with nothing left to finish it. Two cases, both for unfinished revisions:
 * - the revise run is queued for a paused brand (never claimed) and the revision is older than `olderThanMinutes`
 *   (including one re-queued between attempts, whose revision is already running): the run is failed and the post
 *   restored;
 * - the revise run already failed but the restore did not land (e.g. a transient DB error): the post is restored.
 * Returns the number of revisions restored.
 */
export async function sweepStuckRevisions(db: Db, olderThanMinutes = 10): Promise<number> {
  const paused = await db.query<{ period_key: string }>(
    `update agent_runs ar set status = 'failed', finished_at = now(), error = 'brand paused; redo cancelled'
     from post_revisions r join brands b on b.id = r.brand_id
     where ar.kind = 'revise' and ar.status = 'queued' and ar.period_key = r.id::text
       and b.status <> 'active' and r.status in ('queued','running')
       and r.created_at < now() - make_interval(mins => $1)
     returning ar.period_key`,
    [olderThanMinutes]);
  for (const r of paused) {
    await restoreAfterFailedRevision(db, r.period_key);
    await markRevision(db, r.period_key, "failed", "brand paused; redo cancelled");
  }
  const orphaned = await db.query<{ id: string; error: string | null }>(
    `select r.id, ar.error from post_revisions r
       join agent_runs ar on ar.kind = 'revise' and ar.period_key = r.id::text and ar.brand_id = r.brand_id
       join posts p on p.id = r.post_id
     where r.status in ('queued','running') and ar.status = 'failed' and p.status = 'reworking'`);
  for (const r of orphaned) {
    await restoreAfterFailedRevision(db, r.id);
    await markRevision(db, r.id, "failed", r.error ?? "revision failed");
  }
  return paused.length + orphaned.length;
}
