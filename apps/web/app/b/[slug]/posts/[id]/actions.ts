"use server";

import { revalidatePath } from "next/cache";
import { zonedTimeToUtc } from "@carepost/core/time";
import { createClient } from "@/lib/supabase/server";
import { rpcErrorMessage } from "@/lib/rpc-errors";
import { captionProblem, validLocalTime } from "./post-data";

export type ActionResult = { ok: true } | { ok: false; message: string };

const INVALID = rpcErrorMessage({ message: "carepost:invalid_input" });

// Every write goes through the user's RLS client and a SECURITY DEFINER RPC that re-checks role and status.
async function call(slug: string, name: string, args: Record<string, unknown>): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(name, args);
  if (error) return { ok: false, message: rpcErrorMessage(error) };
  // Layout scope: the home, calendar and post pages under this brand all show the change.
  revalidatePath(`/b/${slug}`, "layout");
  return { ok: true };
}

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function approve(slug: string, postId: string): Promise<ActionResult> {
  if (!isId(postId)) return { ok: false, message: INVALID };
  return call(slug, "approve_post", { p_post: postId });
}

export async function unapprove(slug: string, postId: string): Promise<ActionResult> {
  if (!isId(postId)) return { ok: false, message: INVALID };
  return call(slug, "unapprove_post", { p_post: postId });
}

export async function skip(slug: string, postId: string): Promise<ActionResult> {
  if (!isId(postId)) return { ok: false, message: INVALID };
  return call(slug, "skip_post", { p_post: postId });
}

export async function saveCaption(slug: string, postId: string, caption: string, hashtags: string[]): Promise<ActionResult> {
  if (!isId(postId) || typeof caption !== "string" || !Array.isArray(hashtags) || !hashtags.every((h) => typeof h === "string")) {
    return { ok: false, message: INVALID };
  }
  const problem = captionProblem(caption, hashtags);
  if (problem) return { ok: false, message: problem };
  return call(slug, "update_post_caption", { p_post: postId, p_caption: caption, p_hashtags: hashtags });
}

export async function reschedule(slug: string, postId: string, localYmd: string, localHhmm: string): Promise<ActionResult> {
  if (!isId(postId) || !validLocalTime(localYmd, localHhmm)) return { ok: false, message: INVALID };
  const supabase = await createClient();
  // The timezone of the post's own brand (RLS: only readable to its members).
  const { data: post, error } = await supabase.from("posts").select("brand_id").eq("id", postId).maybeSingle();
  if (error || !post) return { ok: false, message: rpcErrorMessage({ message: "carepost:not_found" }) };
  const { data: brand, error: bErr } = await supabase.from("brands").select("timezone").eq("id", post.brand_id).maybeSingle();
  if (bErr || !brand) return { ok: false, message: rpcErrorMessage({ message: "carepost:not_found" }) };
  const at = zonedTimeToUtc(localYmd, localHhmm, brand.timezone);
  return call(slug, "reschedule_post", { p_post: postId, p_planned_at: at.toISOString() });
}
