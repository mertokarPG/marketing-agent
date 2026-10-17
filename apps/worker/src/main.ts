import "dotenv/config";
import fs from "node:fs";
import { buildDeps } from "./runtime/deps.js";
import { schedulerTick } from "./runtime/scheduler.js";
import { runLoopTick } from "./runtime/run-loop.js";
import { publishTick } from "./runtime/publish-loop.js";

const { env, db, runDeps, publishDeps } = buildDeps(process.env);
fs.mkdirSync(env.TMP_ROOT, { recursive: true });
let stopping = false;

function every(ms: number, name: string, fn: () => Promise<unknown>) {
  let busy = false;
  const t = setInterval(async () => {
    if (busy || stopping) return;
    busy = true;
    try { await fn(); } catch (e) { console.error(`[${name}]`, e); } finally { busy = false; }
  }, ms);
  return t;
}

const timers = [
  every(60_000, "scheduler", async () => {
    const n = await schedulerTick(db, new Date());
    if (n) console.log(`[scheduler] enqueued ${n} run(s)`);
  }),
  every(60_000, "publish", async () => {
    const r = await publishTick(publishDeps);
    if (r.expired || r.published || r.failed) console.log("[publish]", r);
  }),
  ...Array.from({ length: env.WORKER_CONCURRENCY }, (_, i) =>
    every(15_000, `runner-${i}`, async () => { while (!stopping && (await runLoopTick(runDeps))); })),
];

console.log(`[worker] started (concurrency ${env.WORKER_CONCURRENCY})`);
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, async () => {
    // In-flight runs are not awaited; heartbeat recovery re-queues them on the next start.
    stopping = true;
    timers.forEach(clearInterval);
    await db.end();
    process.exit(0);
  });
}
