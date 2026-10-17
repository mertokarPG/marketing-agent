import type { Db } from "../db.js";
import { iso } from "./sql.js";

export type PostKind = "core" | "timely";
export type PostStatus = "pending_approval" | "approved" | "publishing" | "published" | "failed" | "rejected" | "expired";
export interface MediaItem { storage_path: string; width?: number; height?: number }
export interface PostRow {
  id: string; brand_id: string; run_id: string | null; kind: PostKind; status: PostStatus; planned_at: Date;
  caption: string; hashtags: string[]; media: MediaItem[]; prompt_ids: string[]; rationale: string;
  external_post_id: string | null; published_at: Date | null; publish_error: string | null;
  is_outlier: boolean; notes: string | null; created_at: Date; updated_at: Date;
}
export interface PostInsert {
  id?: string; brand_id: string; run_id?: string | null; kind: PostKind; status: PostStatus; planned_at: Date;
  caption: string; hashtags: string[]; media: MediaItem[]; prompt_ids: string[]; rationale: string;
  published_at?: Date | null; external_post_id?: string | null; notes?: string | null;
}
export type DuePost = PostRow & { publisher: "postiz" };
export const NON_TERMINAL_STATUSES: PostStatus[] = ["pending_approval", "approved", "publishing"];

export async function insertPost(db: Db, p: PostInsert): Promise<string> {
  const [row] = await db.query<{ id: string }>(
    `insert into posts (id, brand_id, run_id, kind, status, planned_at, caption, hashtags, media, prompt_ids, rationale, published_at, external_post_id, notes)
     values (coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8::text[], $9::jsonb, $10::text[], $11, $12, $13, $14)
     returning id`,
    [p.id ?? null, p.brand_id, p.run_id ?? null, p.kind, p.status, p.planned_at, p.caption, p.hashtags,
     JSON.stringify(p.media), p.prompt_ids, p.rationale, p.published_at ?? null, p.external_post_id ?? null, p.notes ?? null]
  );
  return row.id;
}

export async function getRecentPosts(db: Db, brandId: string, limit: number): Promise<PostRow[]> {
  return db.query<PostRow>(
    "select * from posts where brand_id = $1 order by coalesce(published_at, planned_at) desc, created_at desc limit $2",
    [brandId, limit]);
}

export async function getUsedPromptIds(db: Db, brandId: string): Promise<Set<string>> {
  const rows = await db.query<{ id: string }>("select distinct unnest(prompt_ids) as id from posts where brand_id = $1", [brandId]);
  return new Set(rows.map((r) => r.id));
}

export async function getPlannedPosts(db: Db, brandId: string, from: Date, to: Date): Promise<PostRow[]> {
  return db.query<PostRow>(
    `select * from posts where brand_id = $1 and status = any($2::text[]) and planned_at >= $3 and planned_at < $4
     order by planned_at`, [brandId, NON_TERMINAL_STATUSES, from, to]);
}

export async function countRunPosts(db: Db, runId: string): Promise<number> {
  const [row] = await db.query<{ n: number }>("select count(*)::int as n from posts where run_id = $1", [runId]);
  return row.n;
}

export async function hasCorePostOnLocalDate(db: Db, brandId: string, tz: string, ymd: string): Promise<boolean> {
  const rows = await db.query(
    `select 1 from posts where brand_id = $1 and kind = 'core'
       and status = any($4::text[]) and (planned_at at time zone $2)::date = $3::date limit 1`,
    [brandId, tz, ymd, [...NON_TERMINAL_STATUSES, "published"]]);
  return rows.length > 0;
}

export async function getPostsNeedingExternalId(db: Db, brandId: string) {
  return db.query<{ id: string; caption: string; posted_at: string | null }>(
    `select id, caption, ${iso("published_at")} as posted_at from posts
     where brand_id = $1 and status = 'published' and (external_post_id is null or external_post_id = '')
     order by published_at desc nulls last`, [brandId]);
}

export async function getPostsWithExternalId(db: Db, brandId: string) {
  return db.query<{ id: string; external_post_id: string; posted_at: string | null }>(
    `select id, external_post_id, ${iso("published_at")} as posted_at from posts
     where brand_id = $1 and external_post_id is not null and external_post_id <> ''
     order by published_at desc nulls last`, [brandId]);
}

export async function setExternalPostId(db: Db, postId: string, externalPostId: string): Promise<void> {
  await db.query("update posts set external_post_id = $2 where id = $1", [postId, externalPostId]);
}

export async function setPostOutlier(db: Db, postId: string, isOutlier: boolean, notes: string | null): Promise<void> {
  await db.query("update posts set is_outlier = $2, notes = $3 where id = $1", [postId, isOutlier, notes]);
}

export async function expirePendingPosts(db: Db): Promise<number> {
  const rows = await db.query("update posts set status = 'expired' where status = 'pending_approval' and planned_at <= now() returning id");
  return rows.length;
}

export async function approvePost(db: Db, brandId: string, id: string): Promise<boolean> {
  const rows = await db.query(
    "update posts set status = 'approved' where id = $1 and brand_id = $2 and status = 'pending_approval' and planned_at > now() returning id", [id, brandId]);
  return rows.length === 1;
}

export async function claimDuePosts(db: Db, limit: number): Promise<DuePost[]> {
  return db.query<DuePost>(
    `with due as (
       select p.id from posts p join brands b on b.id = p.brand_id
       where p.status = 'approved' and p.planned_at <= now() and b.publisher is not null
       order by p.planned_at for update of p skip locked limit $1)
     update posts p set status = 'publishing' from due, brands b
     where p.id = due.id and b.id = p.brand_id
     returning p.*, b.publisher`, [limit]);
}

export async function markPublished(db: Db, id: string, externalId: string): Promise<void> {
  await db.query(
    "update posts set status = 'published', published_at = now(), external_post_id = $2, publish_error = null where id = $1",
    [id, externalId]);
}

export async function markFailed(db: Db, id: string, error: string): Promise<void> {
  await db.query("update posts set status = 'failed', publish_error = $2 where id = $1", [id, error]);
}
