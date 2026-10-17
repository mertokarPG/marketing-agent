import "dotenv/config";
import { parseArgs } from "node:util";
import { claimRunById, enqueueRun, getBrandBySlug, isoWeekKey, localParts, addDaysYmd, type RunKind } from "@carepost/core";
import { buildDeps, cliRunDeps } from "./runtime/deps.js";
import { executeRun } from "./runtime/run-loop.js";

const { values } = parseArgs({ options: {
  brand: { type: "string" }, kind: { type: "string", default: "manual" }, period: { type: "string" }, brief: { type: "string" },
} });
const kind = values.kind as RunKind;
if (!values.brand || !["weekly_plan", "daily_check", "manual"].includes(kind)) {
  console.error("Usage: npm run agent -- --brand <slug> --kind weekly_plan|daily_check|manual [--period <key>] [--brief <text>]");
  process.exit(1);
}
const { db, runDeps } = buildDeps(process.env);
const brand = await getBrandBySlug(db, values.brand);
if (!brand) throw new Error(`No brand with slug ${values.brand}`);
const today = localParts(new Date(), brand.timezone).ymd;
const period = values.period ??
  (kind === "weekly_plan" ? isoWeekKey(addDaysYmd(today, 7)) : kind === "daily_check" ? today : `manual-${Date.now()}`);
const id = await enqueueRun(db, brand.id, kind, period);
if (!id) throw new Error(`Run ${kind} ${period} already exists for ${brand.slug}`);
const run = await claimRunById(db, id);
if (!run) throw new Error(`Could not claim run ${id}`);
// One attempt only: if this run fails it is marked failed (never re-queued), so re-run it from the CLI.
await executeRun(cliRunDeps(runDeps, values.brief), run);
const [row] = await db.query<{ status: string; summary: string | null; error: string | null }>(
  "select status, summary, error from agent_runs where id = $1", [id]);
console.log(row);
if (row?.status === "failed") {
  console.error(`Run ${id} (${kind} ${period}) FAILED: ${row.error}\nCLI runs are not retried. Fix the cause and re-run the command${kind === "manual" ? "" : ` (a new --period, or delete the failed agent_runs row for ${period} first)`}.`);
  process.exitCode = 1;
}
await db.end();
