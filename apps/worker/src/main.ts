import "dotenv/config";
import fs from "node:fs";
import { buildDeps } from "./runtime/deps.js";
import { schedulerTick } from "./runtime/scheduler.js";
import { runLoopTick } from "./runtime/run-loop.js";
import { drain } from "./runtime/drain.js";
import { publishTick } from "./runtime/publish-loop.js";

const { env, db, runDeps, publishDeps } = buildDeps(process.env);
fs.mkdirSync(env.TMP_ROOT, { recursive: true });
let stopping = false;
const inFlight = new Set<Promise<unknown>>();
const DRAIN_TIMEOUT_MS = 25_000;

function every(ms: number, name: string, fn: () => Promise<unknown>) {
  let busy = false;
  const t = setInterval(async () => {
    if (busy || stopping) return;
    busy = true;
    const p = (async () => {
      try { await fn(); } catch (e) { console.error(`[${name}]`, e); } finally { busy = false; }
    })();
    inFlight.add(p);
    void p.finally(() => inFlight.delete(p));
    await p;
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
let shuttingDown = false;
async function shutdown(code: number) {
  if (shuttingDown) return;
  shuttingDown = true;
  stopping = true; // stops new ticks and ends runner loops after the current run
  timers.forEach(clearInterval);
  try {
    const clean = await drain(inFlight, DRAIN_TIMEOUT_MS);
    if (!clean) console.warn("[worker] drain timed out; remaining runs will be re-queued by heartbeat recovery");
    await db.end();
  } catch (e) {
    console.error("[worker] shutdown error:", e instanceof Error ? e.message : String(e));
  } finally {
    process.exit(code);
  }
}
for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => void shutdown(0));
process.on("unhandledRejection", (e) => {
  console.error("[worker] unhandledRejection:", e instanceof Error ? e.message : String(e));
  void shutdown(1);
});
process.on("uncaughtException", (e) => {
  console.error("[worker] uncaughtException:", e.message);
  void shutdown(1);
});
