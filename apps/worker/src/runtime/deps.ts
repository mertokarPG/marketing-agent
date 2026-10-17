import { z } from "zod";
import { createPostgresDb, createSupabaseStorage, type BrandConfig } from "@carepost/core";
import { runAgent } from "../orchestrator.js";
import { scrapeAllSources } from "../tools/scrape-hot-topics.js";
import { sendNotification } from "../tools/notify.js";
import { postizPublisher } from "../publishers/postiz.js";
import type { RunDeps } from "./run-loop.js";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  OWNER_EMAIL: z.string().optional(),
  POSTIZ_BRAND_ID: z.string().optional(),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  TMP_ROOT: z.string().default("tmp/runs"),
});
export type WorkerEnv = z.infer<typeof EnvSchema>;

export function readWorkerEnv(env: NodeJS.ProcessEnv): WorkerEnv {
  const r = EnvSchema.safeParse(env);
  if (!r.success) {
    // Names only: never include received values (they may be secrets).
    const missing = r.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Missing/invalid worker env: ${missing}`);
  }
  return r.data;
}

/** Wraps an agent so every call carries the operator's --brief as `userBrief`. */
export function withUserBrief(agent: RunDeps["agent"], brief: string | undefined): RunDeps["agent"] {
  if (!brief) return agent;
  return (b, d, o) => agent(b, d, { ...o, userBrief: brief });
}

export function buildDeps(rawEnv: NodeJS.ProcessEnv) {
  const env = readWorkerEnv(rawEnv);
  const db = createPostgresDb(env.DATABASE_URL);
  const storage = createSupabaseStorage(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const postiz = postizPublisher();
  const notify = (s: string, b: string, to?: string[]) =>
    sendNotification(s, b, { to: to && to.length ? to : env.OWNER_EMAIL ? [env.OWNER_EMAIL] : undefined });
  const runDeps: RunDeps = {
    db, storage, tmpRoot: env.TMP_ROOT, agent: runAgent, scrape: scrapeAllSources,
    publisherFor: (b: BrandConfig) => (b.publisher === "postiz" ? postiz : null),
    notify, now: () => new Date(),
  };
  const publishDeps = { db, storage, publishers: { postiz }, notify: (s: string, b: string) => notify(s, b) };
  return { env, db, storage, runDeps, publishDeps };
}
