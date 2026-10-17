# Carepost Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-brand marketing-agent CLI into a multi-tenant foundation. Brands live in Supabase Postgres. An always-on worker runs the agent per brand on a weekly-plan + daily-check schedule. Every post is saved as a draft with its images in Supabase Storage. A Postiz publisher keeps carephoto posting, and a minimal web app lets members sign in and see drafts.

**Architecture:** npm workspaces with three parts:
- `apps/worker`: today's `src/`, moved; runs in a Railway container.
- `packages/core`: DB adapter, migrations harness, repository, BrandConfig mapping, storage and time helpers.
- `apps/web`: Next.js on Vercel.

The worker uses a Postgres table (`agent_runs`) as its job queue (`FOR UPDATE SKIP LOCKED`). The agent's `schedule_post` tool is replaced by `save_post` (draft only), and a separate publish loop publishes approved, due posts through a `Publisher` interface.

**Tech Stack:** Node 24, TypeScript 5.9, tsx 4.21, vitest 3.2, zod 3.25, `postgres` (postgres.js) 3.4.5, `@electric-sql/pglite` 0.2.17 (tests), `@supabase/supabase-js` 2.49.4, Next.js 15.2.4 + React 19.0.0 + `@supabase/ssr` 0.5.2, Puppeteer 24.41 with system Chromium in Docker.

**Spec:** `docs/superpowers/specs/2026-10-17-saas-foundation-design.md`. Read it before starting any task.

## Global Constraints

- Node 24 (local `v24.1.0`; Docker `node:24-bookworm-slim`). ESM (`"type": "module"`), `module`/`moduleResolution` `Node16`, so relative imports end in `.js`.
- Pinned new dependency versions as listed in Tech Stack. Before adding each, run `npm view <pkg>@<version> version`. If that exact version doesn't exist, use the newest version published at least 14 days ago and note it in the commit message.
- Default brand timezone `Europe/Brussels`. Default posting schedule `{ coreDays: ['mon','tue','wed','thu','fri'], defaultTime: '10:00' }` (5 posts/week).
- `approval_mode` ∈ `review` (default) | `autopilot`. `brands.status` ∈ `active` | `paused`. `brands.publisher` ∈ `null` | `'postiz'`.
- Post `status` ∈ `pending_approval, approved, publishing, published, failed, rejected, expired`. Post `kind` ∈ `core, timely`.
- Run `kind` ∈ `weekly_plan, daily_check, manual`. Run `status` ∈ `queued, running, succeeded, failed`. `unique (brand_id, kind, period_key)`.
- Scheduling, all in brand-local time: weekly_plan on Sunday at 09:00 plans the coming ISO week (`period_key` like `2026-W43`); daily_check every day at 08:00 (`period_key` like `2026-10-19`). Catch-up window is 6 hours; anything later is skipped and logged.
- Run windows:
  - weekly_plan: Monday 00:00 to next Monday 00:00 local.
  - daily_check: now+2h to the end of tomorrow local; at most ONE timely post per run.
  - manual: now+15min to now+14d.
- Queue: heartbeat every 30 s; a `running` row whose heartbeat is older than 10 min is re-queued; 3 attempts max, then `failed`. Worker run concurrency is 2 (`WORKER_CONCURRENCY`).
- Storage buckets are private: `brand-assets` (`{brand_id}/{kind}/{file}`) and `post-media` (`{brand_id}/{post_id}/{n}.{ext}`). Publishers get signed URLs with TTL **3600 s, created at publish time**.
- Migrations: `supabase/migrations/<14-digit timestamp>_<name>.sql`. Storage policies go in a separate file whose name contains `storage`; the PGlite harness skips it.
- A `pending_approval` post whose `planned_at` has passed becomes `expired` and is never published late.
- The agent never publishes directly. Only the publish loop calls a Publisher.
- Do NOT change the creative guidance in `system-prompt.ts` (Moment-of-the-Week, energy axis, wildcard slot, moment-fit check, concept ideation). Only rename tool references and add the product-photos section.
- The worker process runs with `cwd = apps/worker`. `design-systems/`, `brands/`, `data/` and `tmp/` resolve relative to it.
- Commit after every task. Each commit message ends with a blank line, then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **DST and timezone:** around Brussels DST changes (2026-03-29 and 2026-10-25), weekly and daily runs fire at 09:00/08:00 *local* and core slots land at 10:00 local. Owners: Task 3 (time tests) and Task 10 (`dueRuns` tests).
2. **Duplicate posts:** if a weekly_plan retries after a crash, or a daily_check runs twice, the brand must not get two core posts on the same local date or more than one timely post per daily run. Owner: Task 9 (`save_post` guard tests).
3. **Expired vs approved race:** a draft approved after its time has passed must stay `expired` and never be published. `approvePost` and the publish loop are both conditional on status. Owners: Task 4 (`approvePost` test) and Task 12 (publish-loop test).
4. **Signed URL expiry:** media URLs given to the publisher are created at publish time with TTL 3600, never stored at draft time. Owner: Task 12.
5. **Worker crash between upload and insert, or mid-run:** a failed upload or insert leaves no post row. A crashed run is re-queued by heartbeat recovery, and its retry sees the posts already saved (via `get_planned_posts` and the duplicate guard). Owners: Task 9 (upload-failure test) and Task 11 (recovery and retry tests).

---

## File Structure

```
package.json                         root: workspaces, test/typecheck fan-out
Dockerfile                           worker image (Chromium + tsx)
supabase/migrations/
  20261017130000_carepost_foundation.sql   tables, RLS, grants, helpers
  20261017130100_carepost_storage.sql      buckets + storage policies (skipped by PGlite)
packages/core/
  package.json, tsconfig.json, vitest.config.ts
  src/index.ts                       re-exports
  src/db.ts                          Db interface + createPostgresDb
  src/testing.ts                     createTestDb (PGlite + shim + migrations), seed helpers
  src/test-shim.sql                  Supabase-like roles/auth for PGlite
  src/time.ts                        tz math (Intl), ISO weeks, core slots
  src/storage.ts                     StorageClient, BUCKETS, MemoryStorage
  src/storage-supabase.ts            Supabase StorageClient
  src/brand-config.ts                zod schemas (moved from load-brand), BrandConfig, brandConfigFromRow
  src/repo/brands.ts                 brand/asset/source/member reads
  src/repo/posts.ts                  drafts, guards, expiry, publish claims, legacy-compatible reads
  src/repo/metrics.ts                post_metrics (insertAnalytics, getPostPerformance)
  src/repo/trends.ts                 brand-scoped trends
  src/repo/competitors.ts            competitor snapshots
  src/repo/runs.ts                   agent_runs queue
  tests/*.test.ts
apps/worker/                         (git mv of src, tests, scripts, design-systems, brands, assets)
  package.json, tsconfig.json, vitest.config.ts
  data/prompt-banks/carephoto.json
  src/main.ts                        worker entry (replaces src/index.ts)
  src/cli.ts                         one-off run for a brand
  src/lib/browser.ts                 launchBrowser (sandbox args in Docker)
  src/config/load-brand.ts           file loader (seed only) on top of core schema
  src/runtime/types.ts               ToolContext, NotifyFn, RunWindow
  src/runtime/windows.ts             runWindow + buildBrief
  src/runtime/materialize.ts         brand row + assets → BrandConfig in temp dir
  src/runtime/scheduler.ts           dueRuns + schedulerTick
  src/runtime/run-loop.ts            executeRun + runLoopTick
  src/runtime/publish-loop.ts        publishTick
  src/publishers/types.ts            Publisher interface
  src/publishers/postiz.ts           Postiz publisher
  src/tools/save-post.ts             save_post implementation
  src/tools/planned-posts.ts         get_planned_posts formatting
  scripts/lib/seed-brand.ts, scripts/seed-brand.ts
  scripts/lib/migrate-sqlite.ts, scripts/migrate-sqlite.ts
  scripts/legacy/sqlite-schema.ts    (moved from src/db/schema.ts)
apps/web/                            Next.js App Router minimal UI
```

---

### Task 1: Workspace restructure (pure move, tests stay green)

**Files:**
- Move: `src/` → `apps/worker/src/`, `tests/` → `apps/worker/tests/`, `scripts/` → `apps/worker/scripts/`, `design-systems/` → `apps/worker/design-systems/`, `brands/` → `apps/worker/brands/`, `assets/` → `apps/worker/assets/`, `vitest.config.ts` → `apps/worker/vitest.config.ts`, `tsconfig.json` → `apps/worker/tsconfig.json`
- Create: `apps/worker/package.json`, new root `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: workspace names `@carepost/worker`, `@carepost/core` (Task 2), `@carepost/web` (Task 15). Root scripts `npm test` and `npm run typecheck` fan out to workspaces.

- [ ] **Step 1: Record the baseline**

Run: `npm test 2>&1 | tail -5 && npx tsc --noEmit -p . 2>&1 | grep -c "error TS"`
Write down the passing test count and the TS error count (call it `BASELINE_TS_ERRORS`). Later tasks must not increase the TS error count of `apps/worker`.

- [ ] **Step 2: Move files with git**

```bash
mkdir -p apps/worker packages
git mv src apps/worker/src
git mv tests apps/worker/tests
git mv scripts apps/worker/scripts
git mv design-systems apps/worker/design-systems
git mv brands apps/worker/brands
git mv assets apps/worker/assets
git mv vitest.config.ts apps/worker/vitest.config.ts
git mv tsconfig.json apps/worker/tsconfig.json
```

(Untracked files inside `scripts/` move along with the directory. That is expected.)

- [ ] **Step 3: Create `apps/worker/package.json`**

Copy `dependencies` and `devDependencies` verbatim from the current root `package.json`, and move `tsx` from devDependencies into `dependencies` (the container runs tsx):

```json
{
  "name": "@carepost/worker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx src/main.ts",
    "agent": "tsx src/cli.ts",
    "seed-brand": "tsx scripts/seed-brand.ts",
    "migrate-sqlite": "tsx scripts/migrate-sqlite.ts",
    "flag-outlier": "tsx scripts/flag-outlier.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit -p ."
  },
  "dependencies": { "...": "copied from root, plus tsx" },
  "devDependencies": { "...": "copied from root, minus tsx" }
}
```

For this step only, keep the `start` script as `tsx src/index.ts`. `main.ts` arrives in Task 13.

- [ ] **Step 4: Replace the root `package.json`**

```json
{
  "name": "carepost",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "test": "npm test --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present"
  }
}
```

- [ ] **Step 5: Update `.gitignore`**

Add these lines, keeping the existing ones:

```
apps/*/tmp/
apps/*/marketing-agent.db*
apps/web/.next/
```

Then move the local DB so legacy scripts still find it: `mv marketing-agent.db* apps/worker/ 2>/dev/null || true`. It's gitignored, so this is not part of the commit.

- [ ] **Step 6: Reinstall and run the tests**

Run: `rm -rf node_modules && npm install && npm test`
Expected: the same passing test count as Step 1. Then run `cd apps/worker && npx tsc --noEmit -p . 2>&1 | grep -c "error TS"`; expected ≤ `BASELINE_TS_ERRORS`.

- [ ] **Step 7: Commit**

```bash
git add -A package.json package-lock.json .gitignore apps
git commit -m "chore: move agent into apps/worker npm workspace

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `packages/core`: Db adapter and PGlite test harness

**Files:**
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/vitest.config.ts`, `packages/core/src/index.ts`, `packages/core/src/db.ts`, `packages/core/src/testing.ts`, `packages/core/src/test-shim.sql`, `supabase/migrations/.gitkeep`
- Test: `packages/core/tests/db.test.ts`

**Interfaces:**
- Produces:
  - `interface Db { query<T = any>(text: string, params?: unknown[]): Promise<T[]> }`
  - `createPostgresDb(url: string): Db & { end(): Promise<void> }`
  - From `@carepost/core/testing`: `createTestDb(opts?: { migrations?: boolean }): Promise<{ db: Db; pg: PGlite }>` and `pgliteDb(pg: PGlite): Db`

- [ ] **Step 1: Package files**

`packages/core/package.json`:
```json
{
  "name": "@carepost/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": { "types": "./src/index.ts", "default": "./src/index.ts" },
    "./testing": { "types": "./src/testing.ts", "default": "./src/testing.ts" }
  },
  "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit -p ." },
  "dependencies": {
    "postgres": "3.4.5",
    "@supabase/supabase-js": "2.49.4",
    "zod": "3.25.76"
  },
  "devDependencies": {
    "@electric-sql/pglite": "0.2.17",
    "@types/node": "^22.10.0",
    "typescript": "5.9.3",
    "vitest": "3.2.4"
  }
}
```

`packages/core/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "Node16", "moduleResolution": "Node16",
    "strict": true, "esModuleInterop": true, "skipLibCheck": true,
    "resolveJsonModule": true, "noEmit": true
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

`packages/core/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { globals: true, environment: "node", testTimeout: 20000 } });
```

Also add `"@carepost/core": "*"` to `apps/worker/package.json` dependencies, and `"@electric-sql/pglite": "0.2.17"` to its devDependencies.

- [ ] **Step 2: Write the failing test** in `packages/core/tests/db.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { createTestDb } from "../src/testing.js";

describe("createTestDb", () => {
  it("runs parameterised queries", async () => {
    const { db } = await createTestDb({ migrations: false });
    const rows = await db.query<{ n: number; s: string }>("select $1::int as n, $2::text as s", [41, "x"]);
    expect(rows).toEqual([{ n: 41, s: "x" }]);
  });

  it("installs the Supabase-like shim", async () => {
    const { db } = await createTestDb({ migrations: false });
    const roles = await db.query<{ rolname: string }>(
      "select rolname from pg_roles where rolname in ('anon','authenticated','service_role') order by 1"
    );
    expect(roles.map((r) => r.rolname)).toEqual(["anon", "authenticated", "service_role"]);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", ["11111111-1111-1111-1111-111111111111"]);
    const [{ uid }] = await db.query<{ uid: string }>("select auth.uid() as uid");
    expect(uid).toBe("11111111-1111-1111-1111-111111111111");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd packages/core && npx vitest run tests/db.test.ts`
Expected: FAIL, `Cannot find module '../src/testing.js'`.

- [ ] **Step 4: Implement**

`packages/core/src/db.ts`:
```ts
import postgres from "postgres";

export interface Db {
  query<T = any>(text: string, params?: unknown[]): Promise<T[]>;
}

export function createPostgresDb(url: string): Db & { end(): Promise<void> } {
  // prepare:false keeps us compatible with Supabase's transaction pooler.
  const sql = postgres(url, { prepare: false, max: 5 });
  return {
    async query<T = any>(text: string, params: unknown[] = []) {
      return (await sql.unsafe(text, params as any[])) as unknown as T[];
    },
    end: () => sql.end(),
  };
}
```

`packages/core/src/test-shim.sql`:
```sql
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema public, auth to anon, authenticated, service_role;
-- Mirror Supabase defaults so our migrations must explicitly revoke what they don't want.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
```

`packages/core/src/testing.ts`:
```ts
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Db } from "./db.js";

const SHIM = readFileSync(fileURLToPath(new URL("./test-shim.sql", import.meta.url)), "utf8");
const MIGRATIONS_DIR = fileURLToPath(new URL("../../../supabase/migrations/", import.meta.url));

export function pgliteDb(pg: PGlite): Db {
  return {
    async query<T = any>(text: string, params: unknown[] = []) {
      const res = await pg.query<T>(text, params as any[]);
      return res.rows;
    },
  };
}

export async function createTestDb(opts: { migrations?: boolean } = {}): Promise<{ db: Db; pg: PGlite }> {
  const pg = new PGlite();
  await pg.exec(SHIM);
  if (opts.migrations !== false) {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql") && !f.includes("storage"))
      .sort();
    for (const f of files) await pg.exec(readFileSync(MIGRATIONS_DIR + f, "utf8"));
  }
  return { db: pgliteDb(pg), pg };
}
```

`packages/core/src/index.ts`:
```ts
export * from "./db.js";
```

Create an empty `supabase/migrations/.gitkeep`.

- [ ] **Step 5: Install and run the tests**

Run: `npm install && cd packages/core && npx vitest run`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/core supabase apps/worker/package.json package-lock.json
git commit -m "feat(core): Db adapter and PGlite test harness

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Time utilities (timezone, ISO weeks, core slots)

Uses the built-in `Intl.DateTimeFormat` rather than adding `date-fns-tz`. We need four operations (local parts, local→UTC, ISO week, add days), each about 10 lines, and avoiding the dependency also avoids its ESM/CJS quirks under Node16 resolution.

**Files:**
- Create: `packages/core/src/time.ts`
- Modify: `packages/core/src/index.ts` (add `export * from "./time.js";`)
- Test: `packages/core/tests/time.test.ts`

**Interfaces:**
- Produces:
  - `type Weekday = 'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun'` and `WEEKDAYS: readonly Weekday[]`
  - `localParts(date: Date, tz: string): { ymd: string; hour: number; minute: number; weekday: Weekday }`
  - `zonedTimeToUtc(ymd: string, hhmm: string, tz: string): Date`
  - `addDaysYmd(ymd: string, days: number): string`
  - `isoWeekKey(ymd: string): string` and `mondayOfIsoWeek(key: string): string`
  - `formatLocal(date: Date, tz: string): string` (e.g. `"Mon 2026-10-19 10:00"`)
  - `coreSlots(weekKey: string, coreDays: Weekday[], defaultTime: string, tz: string): { ymd: string; weekday: Weekday; at: Date }[]`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { localParts, zonedTimeToUtc, addDaysYmd, isoWeekKey, mondayOfIsoWeek, formatLocal, coreSlots } from "../src/time.js";

const BXL = "Europe/Brussels";

describe("zonedTimeToUtc", () => {
  it("handles CET and CEST around the March 2026 switch", () => {
    expect(zonedTimeToUtc("2026-03-22", "09:00", BXL).toISOString()).toBe("2026-03-22T08:00:00.000Z");
    expect(zonedTimeToUtc("2026-03-29", "09:00", BXL).toISOString()).toBe("2026-03-29T07:00:00.000Z");
  });
  it("handles the October 2026 switch back", () => {
    expect(zonedTimeToUtc("2026-10-18", "09:00", BXL).toISOString()).toBe("2026-10-18T07:00:00.000Z");
    expect(zonedTimeToUtc("2026-10-25", "09:00", BXL).toISOString()).toBe("2026-10-25T08:00:00.000Z");
  });
  it("round-trips through localParts", () => {
    const at = zonedTimeToUtc("2026-10-19", "10:00", BXL);
    expect(localParts(at, BXL)).toMatchObject({ ymd: "2026-10-19", hour: 10, minute: 0, weekday: "mon" });
  });
});

describe("ISO weeks", () => {
  it("computes keys", () => {
    expect(isoWeekKey("2026-10-19")).toBe("2026-W43");
    expect(isoWeekKey("2026-01-01")).toBe("2026-W01");
    expect(isoWeekKey("2027-01-01")).toBe("2026-W53");
    expect(isoWeekKey("2026-03-30")).toBe("2026-W14");
  });
  it("finds the Monday of a week", () => {
    expect(mondayOfIsoWeek("2026-W43")).toBe("2026-10-19");
    expect(mondayOfIsoWeek("2026-W01")).toBe("2025-12-29");
    expect(() => mondayOfIsoWeek("2026-43")).toThrow();
  });
  it("adds days across month ends", () => {
    expect(addDaysYmd("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysYmd("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("coreSlots", () => {
  it("returns 5 weekday slots at local 10:00 across the DST week", () => {
    const slots = coreSlots("2026-W44", ["mon", "tue", "wed", "thu", "fri"], "10:00", BXL);
    expect(slots.map((s) => s.ymd)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"]);
    expect(slots[0].at.toISOString()).toBe("2026-10-26T09:00:00.000Z");
    expect(formatLocal(slots[0].at, BXL)).toBe("Mon 2026-10-26 10:00");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/core && npx vitest run tests/time.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `packages/core/src/time.ts`**

```ts
export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export const WEEKDAYS: readonly Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", weekday: "short",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

function parts(date: Date, tz: string): Record<string, string> {
  return Object.fromEntries(fmt(tz).formatToParts(date).map((p) => [p.type, p.value]));
}

export function localParts(date: Date, tz: string) {
  const p = parts(date, tz);
  return {
    ymd: `${p.year}-${p.month}-${p.day}`,
    hour: Number(p.hour),
    minute: Number(p.minute),
    weekday: p.weekday.toLowerCase().slice(0, 3) as Weekday,
  };
}

function offsetMs(date: Date, tz: string): number {
  const p = parts(date, tz);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

export function zonedTimeToUtc(ymd: string, hhmm: string, tz: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - offsetMs(new Date(guess), tz);
  // Re-evaluate the offset at the candidate instant so DST boundaries resolve correctly.
  return new Date(guess - offsetMs(new Date(first), tz));
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function isoWeekKey(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (date.getUTCDay() + 6) % 7; // Monday = 0
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // Thursday of this week
  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

export function mondayOfIsoWeek(key: string): string {
  const m = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!m) throw new Error(`Invalid ISO week key: ${key}`);
  const year = Number(m[1]);
  const week = Number(m[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const mondayW1 = Date.UTC(year, 0, 4 - ((jan4.getUTCDay() + 6) % 7));
  return new Date(mondayW1 + (week - 1) * 7 * 86400000).toISOString().slice(0, 10);
}

export function formatLocal(date: Date, tz: string): string {
  const p = localParts(date, tz);
  const wd = p.weekday[0].toUpperCase() + p.weekday.slice(1);
  return `${wd} ${p.ymd} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export function coreSlots(weekKey: string, coreDays: Weekday[], defaultTime: string, tz: string) {
  const monday = mondayOfIsoWeek(weekKey);
  return WEEKDAYS.map((weekday, i) => ({ weekday, ymd: addDaysYmd(monday, i) }))
    .filter((s) => coreDays.includes(s.weekday))
    .map((s) => ({ ...s, at: zonedTimeToUtc(s.ymd, defaultTime, tz) }));
}
```

Add `export * from "./time.js";` to `src/index.ts`.

- [ ] **Step 4: Run the tests**

Run: `cd packages/core && npx vitest run`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): timezone, ISO week and core-slot helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Schema, RLS and repository

**Files:**
- Create: `supabase/migrations/20261017130000_carepost_foundation.sql`, `supabase/migrations/20261017130100_carepost_storage.sql`
- Create: `packages/core/src/repo/{brands,posts,metrics,trends,competitors,runs}.ts`
- Modify: `packages/core/src/index.ts`, `packages/core/src/testing.ts` (seed helpers)
- Test: `packages/core/tests/schema-rls.test.ts`, `packages/core/tests/repo.test.ts`, `packages/core/tests/runs.test.ts`

**Interfaces:**
- Consumes: `Db`, `createTestDb` (Task 2).
- Produces (exact names; later tasks rely on them):
  - From `brands.ts`:
    - `BrandRow`, `AssetRow`
    - `getBrandById(db, id): Promise<BrandRow | null>`, `getBrandBySlug(db, slug)`, `listActiveBrands(db): Promise<BrandRow[]>`
    - `listBrandAssets(db, brandId): Promise<AssetRow[]>`, `listBrandSources(db, brandId): Promise<Record<string, unknown>[]>`
    - `getBrandNotifyEmails(db, brandId): Promise<string[]>`
  - From `posts.ts`:
    - `PostKind`, `PostStatus`, `MediaItem`, `PostRow`, `PostInsert`, `DuePost`, `NON_TERMINAL_STATUSES`
    - `insertPost(db, p): Promise<string>`, `getRecentPosts(db, brandId, limit)`, `getUsedPromptIds(db, brandId): Promise<Set<string>>`
    - `getPlannedPosts(db, brandId, from: Date, to: Date)`, `countRunPosts(db, runId): Promise<number>`, `hasCorePostOnLocalDate(db, brandId, tz, ymd): Promise<boolean>`
    - `getPostsNeedingExternalId`, `getPostsWithExternalId`, `setExternalPostId`, `setPostOutlier`
    - `expirePendingPosts(db): Promise<number>`, `claimDuePosts(db, limit): Promise<DuePost[]>`, `markPublished(db, id, externalId)`, `markFailed(db, id, error)`, `approvePost(db, id): Promise<boolean>`
  - From `metrics.ts`: `AnalyticsInsert`, `PerformanceRow`, `insertAnalytics(db, a)`, `getPostPerformance(db, brandId, limit)`
  - From `trends.ts`: `TrendInsert`, `TrendRow`, `upsertTrend(db, brandId, t)`, `getTrendsSince(db, brandId, opts)`, `getSourceBaselines(db, brandId)`
  - From `competitors.ts`: `insertCompetitorSnapshot(db, s)`
  - From `runs.ts`:
    - `RunKind`, `RunStatus`, `RunRow`
    - `enqueueRun(db, brandId, kind, periodKey): Promise<string | null>`, `claimNextRun(db)`, `claimRunById(db, id)`
    - `heartbeatRun(db, id)`, `finishRun(db, id, r)`, `requeueRun(db, id, error)`, `recoverStaleRuns(db, opts?)`
  - From `@carepost/core/testing`: `seedTestBrand(db, overrides?): Promise<string>`, `addTestMember(db, brandId, email, role?): Promise<string>`

- [ ] **Step 1: Write the foundation migration**

`supabase/migrations/20261017130000_carepost_foundation.sql`:
```sql
-- Carepost foundation: multi-tenant brands, drafts, runs. Writes are service-role only.

create or replace function public.try_uuid(t text) returns uuid
language plpgsql immutable as $$ begin return t::uuid; exception when others then return null; end $$;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text not null,
  domain text not null default '',
  niche text not null default '',
  description text not null default '',
  tone text not null default '',
  keywords text[] not null default '{}',
  competitors jsonb not null default '[]',
  instagram_handle text,
  design_system text,
  prompt_bank_path text,
  branding jsonb,
  carousel jsonb,
  hot_topics jsonb,
  image_generation jsonb,
  posting_schedule jsonb not null default '{"coreDays":["mon","tue","wed","thu","fri"],"defaultTime":"10:00"}',
  timezone text not null default 'Europe/Brussels',
  approval_mode text not null default 'review' check (approval_mode in ('review','autopilot')),
  status text not null default 'active' check (status in ('active','paused')),
  publisher text check (publisher in ('postiz')),
  created_at timestamptz not null default now()
);

create table if not exists public.brand_members (
  brand_id uuid not null references public.brands(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','editor','viewer')),
  created_at timestamptz not null default now(),
  primary key (brand_id, user_id)
);

create table if not exists public.brand_assets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  kind text not null check (kind in ('logo','font','icon','product')),
  storage_path text not null unique,
  label text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.brand_sources (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  source jsonb not null
);

create table if not exists public.trends (
  id bigint generated always as identity primary key,
  brand_id uuid not null references public.brands(id) on delete cascade,
  source_id text not null,
  category text not null,
  title text not null,
  url text not null,
  summary text,
  published_at timestamptz,
  score integer,
  fetched_at timestamptz not null default now(),
  unique (brand_id, url)
);
create index if not exists trends_brand_fetched on public.trends (brand_id, fetched_at);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  kind text not null check (kind in ('weekly_plan','daily_check','manual')),
  period_key text not null,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed')),
  attempts integer not null default 0,
  heartbeat_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  summary text,
  error text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  image_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (brand_id, kind, period_key)
);
create index if not exists agent_runs_queue on public.agent_runs (status, created_at);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  run_id uuid references public.agent_runs(id) on delete set null,
  kind text not null check (kind in ('core','timely')),
  status text not null check (status in ('pending_approval','approved','publishing','published','failed','rejected','expired')),
  planned_at timestamptz not null,
  caption text not null,
  hashtags text[] not null default '{}',
  media jsonb not null default '[]',
  prompt_ids text[] not null default '{}',
  rationale text not null default '',
  external_post_id text,
  published_at timestamptz,
  publish_error text,
  is_outlier boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists posts_brand_planned on public.posts (brand_id, planned_at);
create index if not exists posts_due on public.posts (status, planned_at);
drop trigger if exists posts_updated_at on public.posts;
create trigger posts_updated_at before update on public.posts for each row execute function public.set_updated_at();

create table if not exists public.post_metrics (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.posts(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  likes integer not null default 0, comments integer not null default 0, shares integer not null default 0,
  reach integer not null default 0, impressions integer not null default 0, views integer not null default 0,
  saves integer not null default 0, profile_visits integer not null default 0, link_clicks integer not null default 0,
  measured_at timestamptz not null default now()
);

create table if not exists public.competitor_snapshots (
  id bigint generated always as identity primary key,
  brand_id uuid not null references public.brands(id) on delete cascade,
  competitor_name text not null,
  content_summary text,
  engagement_notes text,
  scraped_at timestamptz not null default now()
);

-- Membership check used by every policy. SECURITY DEFINER so it can read brand_members under RLS.
create or replace function public.is_brand_member(p_brand_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.brand_members where brand_id = p_brand_id and user_id = auth.uid())
$$;
revoke all on function public.is_brand_member(uuid) from public, anon;
grant execute on function public.is_brand_member(uuid) to authenticated, service_role;

do $$
declare t text;
begin
  foreach t in array array['brands','brand_members','brand_assets','brand_sources','trends','agent_runs','posts','post_metrics','competitor_snapshots'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

drop policy if exists brands_select_member on public.brands;
create policy brands_select_member on public.brands for select to authenticated using (public.is_brand_member(id));

drop policy if exists brand_members_select on public.brand_members;
create policy brand_members_select on public.brand_members for select to authenticated
  using (user_id = auth.uid() or public.is_brand_member(brand_id));

do $$
declare t text;
begin
  foreach t in array array['brand_assets','brand_sources','trends','agent_runs','posts','post_metrics','competitor_snapshots'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_member', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_brand_member(brand_id))', t || '_select_member', t);
  end loop;
end $$;
```

`supabase/migrations/20261017130100_carepost_storage.sql`:
```sql
insert into storage.buckets (id, name, public) values
  ('brand-assets', 'brand-assets', false),
  ('post-media', 'post-media', false)
on conflict (id) do nothing;

drop policy if exists "carepost members read" on storage.objects;
create policy "carepost members read" on storage.objects for select to authenticated
  using (
    bucket_id in ('brand-assets', 'post-media')
    and public.is_brand_member(public.try_uuid((storage.foldername(name))[1]))
  );
```

- [ ] **Step 2: Write the failing RLS tests** in `packages/core/tests/schema-rls.test.ts`

```ts
import { describe, it, expect, beforeEach } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb, seedTestBrand, addTestMember } from "../src/testing.js";
import type { Db } from "../src/db.js";
import { enqueueRun } from "../src/repo/runs.js";

let db: Db;
let pg: PGlite;
let brandA: string;
let brandB: string;
let alice: string;

beforeEach(async () => {
  ({ db, pg } = await createTestDb());
  brandA = await seedTestBrand(db, { slug: "brand-a" });
  brandB = await seedTestBrand(db, { slug: "brand-b" });
  alice = await addTestMember(db, brandA, "alice@example.com");
});

async function asUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  await pg.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await pg.query("set role authenticated");
  try { return await fn(); } finally { await pg.query("reset role"); }
}

describe("RLS", () => {
  it("members see only their brands", async () => {
    const rows = await asUser(alice, () => db.query<{ slug: string }>("select slug from brands order by slug"));
    expect(rows.map((r) => r.slug)).toEqual(["brand-a"]);
  });

  it("members see only their brands' posts", async () => {
    for (const b of [brandA, brandB]) {
      await db.query(
        "insert into posts (brand_id, kind, status, planned_at, caption) values ($1,'core','pending_approval', now(), 'c')", [b]);
    }
    const rows = await asUser(alice, () => db.query<{ brand_id: string }>("select brand_id from posts"));
    expect(rows.map((r) => r.brand_id)).toEqual([brandA]);
  });

  it("non-members see nothing", async () => {
    const stranger = "99999999-9999-9999-9999-999999999999";
    const rows = await asUser(stranger, () => db.query("select * from brands"));
    expect(rows).toEqual([]);
  });

  it("authenticated cannot write", async () => {
    await expect(
      asUser(alice, () => db.query("update brands set name = 'x' where id = $1", [brandA]))
    ).rejects.toThrow(/permission denied/);
  });

  it("enqueueing the same period twice is a no-op", async () => {
    expect(await enqueueRun(db, brandA, "daily_check", "2026-10-19")).not.toBeNull();
    expect(await enqueueRun(db, brandA, "daily_check", "2026-10-19")).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd packages/core && npx vitest run tests/schema-rls.test.ts`. Expected: FAIL (missing exports `seedTestBrand`, `../src/repo/runs.js`).

- [ ] **Step 4: Add seed helpers** to `packages/core/src/testing.ts`

```ts
import { randomUUID } from "node:crypto";

export async function seedTestBrand(
  db: Db,
  o: Partial<{ slug: string; timezone: string; approval_mode: string; status: string; publisher: string | null }> = {}
): Promise<string> {
  const [row] = await db.query<{ id: string }>(
    `insert into brands (slug, name, timezone, approval_mode, status, publisher)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [o.slug ?? `brand-${randomUUID().slice(0, 8)}`, "Test Brand", o.timezone ?? "Europe/Brussels",
     o.approval_mode ?? "review", o.status ?? "active", o.publisher ?? null]
  );
  return row.id;
}

export async function addTestMember(db: Db, brandId: string, email: string, role = "owner"): Promise<string> {
  const id = randomUUID();
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  await db.query("insert into brand_members (brand_id, user_id, role) values ($1, $2, $3)", [brandId, id, role]);
  return id;
}
```

- [ ] **Step 5: Implement `packages/core/src/repo/runs.ts`**

```ts
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

export async function heartbeatRun(db: Db, id: string): Promise<void> {
  await db.query("update agent_runs set heartbeat_at = now() where id = $1 and status = 'running'", [id]);
}

export async function finishRun(
  db: Db, id: string,
  r: { status: "succeeded" | "failed"; summary?: string | null; error?: string | null; inputTokens?: number; outputTokens?: number; imageCount?: number }
): Promise<void> {
  await db.query(
    `update agent_runs set status = $2, finished_at = now(), summary = $3, error = $4,
       input_tokens = $5, output_tokens = $6, image_count = $7 where id = $1`,
    [id, r.status, r.summary ?? null, r.error ?? null, r.inputTokens ?? 0, r.outputTokens ?? 0, r.imageCount ?? 0]
  );
}

export async function requeueRun(db: Db, id: string, error: string): Promise<void> {
  await db.query("update agent_runs set status = 'queued', error = $2, heartbeat_at = null where id = $1", [id, error]);
}

export async function recoverStaleRuns(
  db: Db, opts: { staleMinutes?: number; maxAttempts?: number } = {}
): Promise<{ requeued: number; failed: number }> {
  const rows = await db.query<{ status: RunStatus }>(
    `update agent_runs
       set status = case when attempts >= $2 then 'failed' else 'queued' end,
           error = 'worker heartbeat lost', finished_at = case when attempts >= $2 then now() else null end
     where status = 'running' and heartbeat_at < now() - make_interval(mins => $1)
     returning status`,
    [opts.staleMinutes ?? 10, opts.maxAttempts ?? 3]
  );
  return {
    requeued: rows.filter((r) => r.status === "queued").length,
    failed: rows.filter((r) => r.status === "failed").length,
  };
}
```

- [ ] **Step 6: Run the RLS tests**

Run: `cd packages/core && npx vitest run tests/schema-rls.test.ts`. Expected: PASS (5 tests).

- [ ] **Step 7: Write the failing repo and queue tests**

`packages/core/tests/runs.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedTestBrand } from "../src/testing.js";
import type { Db } from "../src/db.js";
import { enqueueRun, claimNextRun, claimRunById, recoverStaleRuns, finishRun } from "../src/repo/runs.js";

let db: Db;
let brand: string;
beforeEach(async () => { ({ db } = await createTestDb()); brand = await seedTestBrand(db); });

describe("run queue", () => {
  it("claims the oldest queued run once", async () => {
    const a = await enqueueRun(db, brand, "daily_check", "2026-10-18");
    await enqueueRun(db, brand, "daily_check", "2026-10-19");
    const run = await claimNextRun(db);
    expect(run?.id).toBe(a);
    expect(run?.status).toBe("running");
    expect(run?.attempts).toBe(1);
    expect(await claimRunById(db, a!)).toBeNull(); // already running
  });

  it("re-queues stale runs and fails them after 3 attempts", async () => {
    const id = await enqueueRun(db, brand, "weekly_plan", "2026-W43");
    await claimNextRun(db);
    await db.query("update agent_runs set heartbeat_at = now() - interval '11 minutes' where id = $1", [id]);
    expect(await recoverStaleRuns(db)).toEqual({ requeued: 1, failed: 0 });
    await db.query("update agent_runs set status='running', attempts=3, heartbeat_at = now() - interval '11 minutes' where id = $1", [id]);
    expect(await recoverStaleRuns(db)).toEqual({ requeued: 0, failed: 1 });
  });

  it("does not touch fresh running runs", async () => {
    await enqueueRun(db, brand, "manual", "m1");
    const run = await claimNextRun(db);
    expect(await recoverStaleRuns(db)).toEqual({ requeued: 0, failed: 0 });
    await finishRun(db, run!.id, { status: "succeeded", summary: "ok", inputTokens: 10 });
    const [row] = await db.query("select status, input_tokens from agent_runs where id = $1", [run!.id]);
    expect(row).toEqual({ status: "succeeded", input_tokens: 10 });
  });
});
```

`packages/core/tests/repo.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedTestBrand, addTestMember } from "../src/testing.js";
import type { Db } from "../src/db.js";
import {
  insertPost, getRecentPosts, getUsedPromptIds, getPlannedPosts, countRunPosts, hasCorePostOnLocalDate,
  expirePendingPosts, claimDuePosts, markPublished, approvePost, setExternalPostId, getPostsWithExternalId,
} from "../src/repo/posts.js";
import { insertAnalytics, getPostPerformance } from "../src/repo/metrics.js";
import { upsertTrend, getTrendsSince, getSourceBaselines } from "../src/repo/trends.js";
import { getBrandNotifyEmails, listActiveBrands } from "../src/repo/brands.js";
import { enqueueRun } from "../src/repo/runs.js";

let db: Db;
let brand: string;
beforeEach(async () => { ({ db } = await createTestDb()); brand = await seedTestBrand(db, { publisher: "postiz" }); });

const base = (o: Partial<Parameters<typeof insertPost>[1]> = {}) => ({
  brand_id: brand, kind: "core" as const, status: "pending_approval" as const,
  planned_at: new Date(Date.now() + 3600_000), caption: "Hello", hashtags: ["#a"],
  media: [{ storage_path: `${brand}/p/0.png` }], prompt_ids: ["p1"], rationale: "why", ...o,
});

describe("posts", () => {
  it("inserts and reads recent posts", async () => {
    const id = await insertPost(db, base());
    const posts = await getRecentPosts(db, brand, 5);
    expect(posts[0]).toMatchObject({ id, caption: "Hello", hashtags: ["#a"], kind: "core" });
    expect(posts[0].media).toEqual([{ storage_path: `${brand}/p/0.png` }]);
    expect(await getUsedPromptIds(db, brand)).toEqual(new Set(["p1"]));
  });

  it("lists planned non-terminal posts in a window", async () => {
    await insertPost(db, base());
    await insertPost(db, base({ status: "rejected" }));
    const rows = await getPlannedPosts(db, brand, new Date(), new Date(Date.now() + 7 * 86400_000));
    expect(rows).toHaveLength(1);
  });

  it("detects a core post on a local date", async () => {
    await insertPost(db, base({ planned_at: new Date("2026-10-19T08:00:00Z") }));
    expect(await hasCorePostOnLocalDate(db, brand, "Europe/Brussels", "2026-10-19")).toBe(true);
    expect(await hasCorePostOnLocalDate(db, brand, "Europe/Brussels", "2026-10-20")).toBe(false);
  });

  it("counts posts per run", async () => {
    const run = await enqueueRun(db, brand, "daily_check", "2026-10-19");
    await insertPost(db, base({ run_id: run, kind: "timely" }));
    expect(await countRunPosts(db, run!)).toBe(1);
  });

  it("expires late drafts and refuses to approve them", async () => {
    const id = await insertPost(db, base({ planned_at: new Date(Date.now() - 60_000) }));
    expect(await expirePendingPosts(db)).toBe(1);
    expect(await approvePost(db, id)).toBe(false);
    const [row] = await db.query("select status from posts where id = $1", [id]);
    expect(row.status).toBe("expired");
  });

  it("approves a future draft", async () => {
    const id = await insertPost(db, base());
    expect(await approvePost(db, id)).toBe(true);
  });

  it("claims due approved posts only for brands with a publisher", async () => {
    const other = await seedTestBrand(db, { publisher: null });
    const due = await insertPost(db, base({ status: "approved", planned_at: new Date(Date.now() - 1000) }));
    await insertPost(db, { ...base({ status: "approved", planned_at: new Date(Date.now() - 1000) }), brand_id: other });
    await insertPost(db, base({ status: "approved" })); // future
    const claimed = await claimDuePosts(db, 10);
    expect(claimed.map((p) => p.id)).toEqual([due]);
    expect(claimed[0].publisher).toBe("postiz");
    expect(await claimDuePosts(db, 10)).toEqual([]); // now 'publishing'
    await markPublished(db, due, "ext-1");
    const [row] = await db.query("select status, external_post_id from posts where id = $1", [due]);
    expect(row).toEqual({ status: "published", external_post_id: "ext-1" });
  });
});

describe("metrics", () => {
  it("returns the latest snapshot per post with legacy field names", async () => {
    const id = await insertPost(db, base({ status: "published", published_at: new Date("2026-10-01T10:00:00Z") }));
    await setExternalPostId(db, id, "x1");
    expect((await getPostsWithExternalId(db, brand))[0]).toMatchObject({ id, external_post_id: "x1" });
    const m = { post_id: id, brand_id: brand, likes: 1, comments: 0, shares: 0, reach: 5, impressions: 5, views: 9, saves: 0, profile_visits: 0, link_clicks: 0 };
    await insertAnalytics(db, m);
    await db.query("update post_metrics set measured_at = now() - interval '1 day'");
    await insertAnalytics(db, { ...m, likes: 7 });
    const perf = await getPostPerformance(db, brand, 10);
    expect(perf).toHaveLength(1);
    expect(perf[0]).toMatchObject({ post_id: id, likes: 7, content_theme: "core", posted_at: "2026-10-01T10:00:00Z", is_outlier: false });
  });
});

describe("trends", () => {
  it("upserts per brand and normalises dates", async () => {
    await upsertTrend(db, brand, { source_id: "hn", category: "tech", title: "A", url: "https://x/1", score: 10, published_at: "Mon, 19 Oct 2026 08:00:00 GMT" });
    await upsertTrend(db, brand, { source_id: "hn", category: "tech", title: "A2", url: "https://x/1", score: 30, published_at: "not a date" });
    const rows = await getTrendsSince(db, brand, { lookbackHours: 24 * 3650 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: "A2", score: 30 });
    expect(rows[0].published_at).toBe("2026-10-19T08:00:00Z");
    expect((await getSourceBaselines(db, brand)).get("hn")).toEqual({ median: 30, p90: 30 });
  });
});

describe("brands", () => {
  it("lists active brands and member emails", async () => {
    await seedTestBrand(db, { status: "paused" });
    await addTestMember(db, brand, "owner@example.com", "owner");
    await addTestMember(db, brand, "viewer@example.com", "viewer");
    expect((await listActiveBrands(db)).map((b) => b.id)).toEqual([brand]);
    expect(await getBrandNotifyEmails(db, brand)).toEqual(["owner@example.com"]);
  });
});
```

- [ ] **Step 8: Run to verify they fail**

Run: `cd packages/core && npx vitest run tests/repo.test.ts tests/runs.test.ts`. Expected: FAIL (missing modules).

- [ ] **Step 9: Implement the repo modules**

`packages/core/src/repo/sql.ts` (shared helper):
```ts
/** ISO-8601 UTC text for a timestamptz column, e.g. 2026-10-19T08:00:00Z (keeps legacy string consumers working). */
export const iso = (col: string) => `to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
```

`packages/core/src/repo/brands.ts`:
```ts
import type { Db } from "../db.js";

export interface BrandRow {
  id: string; slug: string; name: string; domain: string; niche: string; description: string; tone: string;
  keywords: string[]; competitors: unknown; instagram_handle: string | null; design_system: string | null;
  prompt_bank_path: string | null; branding: unknown; carousel: unknown; hot_topics: unknown; image_generation: unknown;
  posting_schedule: unknown; timezone: string; approval_mode: "review" | "autopilot"; status: "active" | "paused";
  publisher: "postiz" | null; created_at: Date;
}
export interface AssetRow {
  id: string; brand_id: string; kind: "logo" | "font" | "icon" | "product"; storage_path: string; label: string | null; metadata: unknown;
}

export async function getBrandById(db: Db, id: string): Promise<BrandRow | null> {
  return (await db.query<BrandRow>("select * from brands where id = $1", [id]))[0] ?? null;
}
export async function getBrandBySlug(db: Db, slug: string): Promise<BrandRow | null> {
  return (await db.query<BrandRow>("select * from brands where slug = $1", [slug]))[0] ?? null;
}
export async function listActiveBrands(db: Db): Promise<BrandRow[]> {
  return db.query<BrandRow>("select * from brands where status = 'active' order by created_at");
}
export async function listBrandAssets(db: Db, brandId: string): Promise<AssetRow[]> {
  return db.query<AssetRow>("select * from brand_assets where brand_id = $1 order by kind, created_at", [brandId]);
}
export async function listBrandSources(db: Db, brandId: string): Promise<Record<string, unknown>[]> {
  const rows = await db.query<{ source: Record<string, unknown> }>("select source from brand_sources where brand_id = $1", [brandId]);
  return rows.map((r) => r.source);
}
export async function getBrandNotifyEmails(db: Db, brandId: string): Promise<string[]> {
  const rows = await db.query<{ email: string }>(
    `select u.email from brand_members m join auth.users u on u.id = m.user_id
     where m.brand_id = $1 and m.role in ('owner','editor') and u.email is not null order by u.email`, [brandId]);
  return rows.map((r) => r.email);
}
```

`packages/core/src/repo/posts.ts`:
```ts
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

export async function approvePost(db: Db, id: string): Promise<boolean> {
  const rows = await db.query(
    "update posts set status = 'approved' where id = $1 and status = 'pending_approval' and planned_at > now() returning id", [id]);
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
```

`packages/core/src/repo/metrics.ts`:
```ts
import type { Db } from "../db.js";
import { iso } from "./sql.js";

export interface AnalyticsInsert {
  post_id: string; brand_id: string; likes: number; comments: number; shares: number; reach: number;
  impressions: number; views: number; saves: number; profile_visits: number; link_clicks: number;
}
export interface PerformanceRow extends Omit<AnalyticsInsert, "brand_id"> {
  external_post_id: string | null; caption: string; content_theme: string | null; posted_at: string | null;
  is_outlier: boolean; notes: string | null; measured_at: string;
}

export async function insertAnalytics(db: Db, a: AnalyticsInsert): Promise<void> {
  await db.query(
    `insert into post_metrics (post_id, brand_id, likes, comments, shares, reach, impressions, views, saves, profile_visits, link_clicks)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [a.post_id, a.brand_id, a.likes, a.comments, a.shares, a.reach, a.impressions, a.views, a.saves, a.profile_visits, a.link_clicks]);
}

/** Latest metrics snapshot per post, newest posts first. Field names match the legacy SQLite shape. */
export async function getPostPerformance(db: Db, brandId: string, limit: number): Promise<PerformanceRow[]> {
  return db.query<PerformanceRow>(
    `select distinct on (p.id)
        p.id as post_id, p.external_post_id, p.caption, p.kind as content_theme, ${iso("p.published_at")} as posted_at,
        p.is_outlier, p.notes, m.likes, m.comments, m.shares, m.reach, m.impressions, m.views, m.saves,
        m.profile_visits, m.link_clicks, ${iso("m.measured_at")} as measured_at, p.published_at as _sort
     from posts p join post_metrics m on m.post_id = p.id
     where p.brand_id = $1
     order by p.id, m.measured_at desc`, [brandId]
  ).then((rows) =>
    rows
      .sort((a: any, b: any) => (b._sort?.getTime?.() ?? 0) - (a._sort?.getTime?.() ?? 0))
      .slice(0, limit)
      .map(({ _sort, ...r }: any) => r as PerformanceRow));
}
```

`packages/core/src/repo/trends.ts`:
```ts
import type { Db } from "../db.js";
import { iso } from "./sql.js";

export interface TrendInsert {
  source_id: string; category: string; title: string; url: string;
  summary?: string | null; published_at?: string | null; score?: number | null;
}
export interface TrendRow {
  id: number; source_id: string; category: string; title: string; url: string;
  summary: string | null; published_at: string | null; score: number | null; fetched_at: string;
}

function toTimestamp(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function upsertTrend(db: Db, brandId: string, t: TrendInsert): Promise<void> {
  await db.query(
    `insert into trends (brand_id, source_id, category, title, url, summary, published_at, score)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (brand_id, url) do update set
       score = coalesce(excluded.score, trends.score), title = excluded.title,
       summary = coalesce(excluded.summary, trends.summary),
       published_at = coalesce(trends.published_at, excluded.published_at), fetched_at = now()`,
    [brandId, t.source_id, t.category, t.title, t.url, t.summary ?? null, toTimestamp(t.published_at), t.score ?? null]);
}

export async function getTrendsSince(
  db: Db, brandId: string, opts: { lookbackHours: number; categories?: string[]; minScore?: number | null }
): Promise<TrendRow[]> {
  return db.query<TrendRow>(
    `select id, source_id, category, title, url, summary, ${iso("published_at")} as published_at, score, ${iso("fetched_at")} as fetched_at
     from trends
     where brand_id = $1 and coalesce(published_at, fetched_at) >= now() - make_interval(hours => $2)
       and ($3::text[] is null or category = any($3::text[]))
       and ($4::int is null or (score is not null and score >= $4))
     order by coalesce(score, 0) desc, fetched_at desc`,
    [brandId, opts.lookbackHours, opts.categories && opts.categories.length ? opts.categories : null, opts.minScore ?? null]);
}

export async function getSourceBaselines(db: Db, brandId: string): Promise<Map<string, { median: number; p90: number }>> {
  const rows = await db.query<{ source_id: string; score: number }>(
    `select source_id, score from trends
     where brand_id = $1 and fetched_at >= now() - interval '30 days' and score is not null
     order by source_id, score`, [brandId]);
  const bySource = new Map<string, number[]>();
  for (const r of rows) {
    if (!bySource.has(r.source_id)) bySource.set(r.source_id, []);
    bySource.get(r.source_id)!.push(r.score);
  }
  const out = new Map<string, { median: number; p90: number }>();
  for (const [src, scores] of bySource) {
    out.set(src, {
      median: scores[Math.floor(scores.length / 2)],
      p90: scores[Math.floor(scores.length * 0.9)] ?? scores[scores.length - 1],
    });
  }
  return out;
}
```

`packages/core/src/repo/competitors.ts`:
```ts
import type { Db } from "../db.js";
export async function insertCompetitorSnapshot(
  db: Db, s: { brand_id: string; competitor_name: string; content_summary: string; engagement_notes: string }
): Promise<void> {
  await db.query(
    "insert into competitor_snapshots (brand_id, competitor_name, content_summary, engagement_notes) values ($1,$2,$3,$4)",
    [s.brand_id, s.competitor_name, s.content_summary, s.engagement_notes]);
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from "./repo/brands.js";
export * from "./repo/posts.js";
export * from "./repo/metrics.js";
export * from "./repo/trends.js";
export * from "./repo/competitors.js";
export * from "./repo/runs.js";
```

- [ ] **Step 10: Run all core tests**

Run: `cd packages/core && npx vitest run && npx tsc --noEmit -p .`
Expected: all PASS; tsc prints nothing.

- [ ] **Step 11: Commit**

```bash
git add supabase packages/core
git commit -m "feat(core): foundation schema, RLS and repository

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Storage client and BrandConfig in core

**Files:**
- Create: `packages/core/src/storage.ts`, `packages/core/src/storage-supabase.ts`, `packages/core/src/brand-config.ts`
- Modify: `packages/core/src/index.ts`; `apps/worker/src/config/load-brand.ts` (re-use the core schema); `apps/worker/brands/carephoto/brand.json` (new `postingSchedule` shape, relative prompt bank); test fixtures in `apps/worker/tests/{orchestrator,config/system-prompt,e2e/dry-run}.test.ts` (postingSchedule shape)
- Create: `apps/worker/data/prompt-banks/carephoto.json` (copy)
- Test: `packages/core/tests/brand-config.test.ts`, `packages/core/tests/storage.test.ts`

**Interfaces:**
- Consumes: `BrandRow`, `AssetRow` (Task 4).
- Produces:
  - `BUCKETS = { assets: "brand-assets", media: "post-media" } as const`
  - `interface StorageClient { download(bucket, path): Promise<Buffer>; upload(bucket, path, bytes: Buffer, contentType: string): Promise<void>; signedUrl(bucket, path, ttlSec: number): Promise<string> }`
  - `class MemoryStorage implements StorageClient` (public `files: Map<string, {bytes, contentType}>`, `signedCalls: {bucket, path, ttlSec}[]`, `failUploads: boolean`)
  - `createSupabaseStorage(url: string, serviceRoleKey: string): StorageClient`
  - `BrandFileSchema`, `type BrandFile`, `type BrandConfig`, `PostingScheduleSchema`
  - `brandConfigFromRow(row: BrandRow, assets: AssetRow[], brandDir: string): BrandConfig` and `assetLocalPath(a: Pick<AssetRow, "kind" | "storage_path">): string`

- [ ] **Step 1: Write the failing tests**

`packages/core/tests/storage.test.ts`:
```ts
import { it, expect } from "vitest";
import { MemoryStorage } from "../src/storage.js";

it("memory storage round-trips and records signed URL requests", async () => {
  const s = new MemoryStorage();
  await s.upload("post-media", "b/p/0.png", Buffer.from("x"), "image/png");
  expect((await s.download("post-media", "b/p/0.png")).toString()).toBe("x");
  expect(await s.signedUrl("post-media", "b/p/0.png", 3600)).toBe("memory://post-media/b/p/0.png?ttl=3600");
  expect(s.signedCalls).toEqual([{ bucket: "post-media", path: "b/p/0.png", ttlSec: 3600 }]);
  await expect(s.download("post-media", "missing")).rejects.toThrow(/not found/);
});
```

`packages/core/tests/brand-config.test.ts`:
```ts
import { it, expect } from "vitest";
import { brandConfigFromRow, assetLocalPath } from "../src/brand-config.js";
import type { BrandRow, AssetRow } from "../src/repo/brands.js";

const row = {
  id: "0b6d6a3e-0000-4000-8000-000000000001", slug: "kuanyin", name: "Kuanyin Skin", domain: "kuanyin.be",
  niche: "skincare", description: "d", tone: "calm", keywords: ["skin"], competitors: [], instagram_handle: "kuanyin",
  design_system: null, prompt_bank_path: null, branding: { enabled: true, logoPath: "assets/logo.png" }, carousel: null,
  hot_topics: null, image_generation: null, posting_schedule: { coreDays: ["mon", "wed"], defaultTime: "09:30" },
  timezone: "Europe/Brussels", approval_mode: "review", status: "active", publisher: null, created_at: new Date(),
} as BrandRow;

it("maps a row and product assets to BrandConfig", () => {
  const assets = [
    { kind: "logo", storage_path: `${row.id}/logo/logo.png`, label: null },
    { kind: "product", storage_path: `${row.id}/product/serum.jpg`, label: "Rosehip serum" },
  ] as AssetRow[];
  const b = brandConfigFromRow(row, assets, "/tmp/run1");
  expect(b).toMatchObject({
    id: "kuanyin", dbId: row.id, slug: "kuanyin", timezone: "Europe/Brussels", approvalMode: "review", publisher: null,
    brandDir: "/tmp/run1", postingSchedule: { coreDays: ["mon", "wed"], defaultTime: "09:30" },
    productPhotos: [{ path: "assets/products/serum.jpg", label: "Rosehip serum" }],
  });
  expect(assetLocalPath(assets[0])).toBe("assets/logo.png");
});

it("applies the default 5-day schedule", () => {
  const b = brandConfigFromRow({ ...row, posting_schedule: {} } as BrandRow, [], "/tmp/x");
  expect(b.postingSchedule).toEqual({ coreDays: ["mon", "tue", "wed", "thu", "fri"], defaultTime: "10:00" });
});

it("rejects an invalid time", () => {
  expect(() => brandConfigFromRow({ ...row, posting_schedule: { defaultTime: "25:00" } } as BrandRow, [], "/tmp/x")).toThrow();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/core && npx vitest run tests/storage.test.ts tests/brand-config.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement storage**

`packages/core/src/storage.ts`:
```ts
export const BUCKETS = { assets: "brand-assets", media: "post-media" } as const;

export interface StorageClient {
  download(bucket: string, path: string): Promise<Buffer>;
  upload(bucket: string, path: string, bytes: Buffer, contentType: string): Promise<void>;
  signedUrl(bucket: string, path: string, ttlSec: number): Promise<string>;
}

export class MemoryStorage implements StorageClient {
  files = new Map<string, { bytes: Buffer; contentType: string }>();
  signedCalls: { bucket: string; path: string; ttlSec: number }[] = [];
  failUploads = false;
  async download(bucket: string, path: string) {
    const f = this.files.get(`${bucket}/${path}`);
    if (!f) throw new Error(`object not found: ${bucket}/${path}`);
    return f.bytes;
  }
  async upload(bucket: string, path: string, bytes: Buffer, contentType: string) {
    if (this.failUploads) throw new Error("upload failed (test)");
    this.files.set(`${bucket}/${path}`, { bytes, contentType });
  }
  async signedUrl(bucket: string, path: string, ttlSec: number) {
    this.signedCalls.push({ bucket, path, ttlSec });
    return `memory://${bucket}/${path}?ttl=${ttlSec}`;
  }
}
```

`packages/core/src/storage-supabase.ts`:
```ts
import { createClient } from "@supabase/supabase-js";
import type { StorageClient } from "./storage.js";

export function createSupabaseStorage(url: string, serviceRoleKey: string): StorageClient {
  const sb = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  return {
    async download(bucket, path) {
      const { data, error } = await sb.storage.from(bucket).download(path);
      if (error || !data) throw new Error(`storage download ${bucket}/${path}: ${error?.message ?? "no data"}`);
      return Buffer.from(await data.arrayBuffer());
    },
    async upload(bucket, path, bytes, contentType) {
      const { error } = await sb.storage.from(bucket).upload(path, bytes, { contentType, upsert: true });
      if (error) throw new Error(`storage upload ${bucket}/${path}: ${error.message}`);
    },
    async signedUrl(bucket, path, ttlSec) {
      const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, ttlSec);
      if (error || !data) throw new Error(`storage sign ${bucket}/${path}: ${error?.message ?? "no data"}`);
      return data.signedUrl;
    },
  };
}
```

- [ ] **Step 4: Implement `packages/core/src/brand-config.ts`**

Move every schema from `apps/worker/src/config/load-brand.ts` (`CompetitorSchema`, `BrandColorsSchema`, `BrandingSchema`, `CarouselSchema`, `ImageGenerationSchema`, `HotTopicsSchema`) into this file **verbatim**, then add:

```ts
import path from "node:path";
import { z } from "zod";
import type { AssetRow, BrandRow } from "./repo/brands.js";
import { WEEKDAYS, type Weekday } from "./time.js";
// ...moved schemas here...

export const PostingScheduleSchema = z.object({
  coreDays: z.array(z.enum(WEEKDAYS as unknown as [Weekday, ...Weekday[]])).min(1).default(["mon", "tue", "wed", "thu", "fri"]),
  defaultTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("10:00"),
});

export const BrandFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string(),
  niche: z.string(),
  description: z.string(),
  competitors: z.array(CompetitorSchema),
  keywords: z.array(z.string()),
  tone: z.string(),
  postingSchedule: PostingScheduleSchema.default({}),
  promptBankPath: z.string().optional(),
  instagramHandle: z.string().optional(),
  designSystem: z.string().optional(),
  branding: BrandingSchema.optional(),
  carousel: CarouselSchema.optional(),
  hotTopics: HotTopicsSchema.optional(),
  imageGeneration: ImageGenerationSchema.optional(),
  // Seed-only fields (ignored by the agent):
  timezone: z.string().default("Europe/Brussels"),
  approvalMode: z.enum(["review", "autopilot"]).default("review"),
  publisher: z.enum(["postiz"]).nullable().default(null),
});
export type BrandFile = z.infer<typeof BrandFileSchema>;

export type BrandConfig = BrandFile & {
  brandDir: string;
  dbId: string;
  slug: string;
  productPhotos: { path: string; label: string }[];
};

export function assetLocalPath(a: Pick<AssetRow, "kind" | "storage_path">): string {
  const file = path.posix.basename(a.storage_path);
  return a.kind === "product" ? `assets/products/${file}` : `assets/${file}`;
}

const orUndef = <T>(v: T | null) => (v === null ? undefined : v);

export function brandConfigFromRow(row: BrandRow, assets: AssetRow[], brandDir: string): BrandConfig {
  const file = BrandFileSchema.parse({
    id: row.slug, name: row.name, domain: row.domain, niche: row.niche, description: row.description,
    competitors: row.competitors, keywords: row.keywords, tone: row.tone, postingSchedule: row.posting_schedule ?? {},
    promptBankPath: orUndef(row.prompt_bank_path), instagramHandle: orUndef(row.instagram_handle),
    designSystem: orUndef(row.design_system), branding: orUndef(row.branding), carousel: orUndef(row.carousel),
    hotTopics: orUndef(row.hot_topics), imageGeneration: orUndef(row.image_generation),
    timezone: row.timezone, approvalMode: row.approval_mode, publisher: row.publisher,
  });
  return {
    ...file,
    brandDir,
    dbId: row.id,
    slug: row.slug,
    productPhotos: assets
      .filter((a) => a.kind === "product")
      .map((a) => ({ path: assetLocalPath(a), label: a.label ?? path.posix.basename(a.storage_path) })),
  };
}
```

Append to `packages/core/src/index.ts`: `export * from "./storage.js"; export * from "./storage-supabase.js"; export * from "./brand-config.js";`

- [ ] **Step 5: Point the worker's `load-brand.ts` at the core schema**

Replace the schema declarations in `apps/worker/src/config/load-brand.ts` with an import, and keep `loadBrand`/`brandSourcesPath` (used by the seed script) returning the file shape plus `brandDir`:

```ts
import fs from "fs";
import path from "path";
import { BrandFileSchema, type BrandFile } from "@carepost/core";
export type { BrandConfig } from "@carepost/core";

export type BrandFileWithDir = BrandFile & { brandDir: string };

export function loadBrand(brandId: string, brandsDir: string): BrandFileWithDir {
  const brandDir = path.join(brandsDir, brandId);
  const raw = fs.readFileSync(path.join(brandDir, "brand.json"), "utf-8");
  return { ...BrandFileSchema.parse(JSON.parse(raw)), brandDir };
}

export function brandSourcesPath(brand: BrandFileWithDir): string {
  const file = brand.hotTopics?.sourcesFile ?? "hot-topics-sources.json";
  return path.isAbsolute(file) ? file : path.join(brand.brandDir, file);
}
```

(The legacy flat-file fallback `brands/<id>.json` is dropped: no flat files exist in `brands/`. Check with `ls apps/worker/brands`.)

- [ ] **Step 6: Update the carephoto brand file and prompt bank**

```bash
mkdir -p apps/worker/data/prompt-banks
cp /Users/mertokar/GitHub/lula/public/promptbank/prompts.json apps/worker/data/prompt-banks/carephoto.json
```

In `apps/worker/brands/carephoto/brand.json`:
- Set `"postingSchedule": { "coreDays": ["mon","tue","wed","thu","fri","sat","sun"], "defaultTime": "10:00" }` (carephoto posts daily today).
- Set `"promptBankPath": "data/prompt-banks/carephoto.json"`.
- Add `"timezone": "Europe/Brussels"`, `"approvalMode": "autopilot"` and `"publisher": "postiz"`.

In the three worker test fixtures that build a `BrandConfig` literal (`tests/orchestrator.test.ts`, `tests/config/system-prompt.test.ts`, `tests/e2e/dry-run.test.ts`), replace `postingSchedule: { frequency: "daily", preferredTime: "10:00" }` with `postingSchedule: { coreDays: ["mon","tue","wed","thu","fri"], defaultTime: "10:00" }` and add `timezone: "Europe/Brussels", approvalMode: "review", publisher: null, dbId: "00000000-0000-4000-8000-000000000001", slug: "testbrand", productPhotos: []`. In `tests/config/load-brand.test.ts`, update the JSON fixtures to the new `postingSchedule` shape and remove any test of the legacy flat-file fallback.

- [ ] **Step 7: Run the tests**

Run: `cd packages/core && npx vitest run && cd ../../apps/worker && npx vitest run tests/config`
Expected: core PASS; worker `tests/config` PASS. (Worker DB-backed tests are fixed in Task 7; it is fine if `tests/db` and `tests/tools/{recent-posts,post-performance}` still pass on SQLite at this point.)

- [ ] **Step 8: Commit**

```bash
git add packages/core apps/worker/src/config apps/worker/brands apps/worker/data apps/worker/tests
git commit -m "feat(core): storage client and DB-backed BrandConfig

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Asset materialisation

**Files:**
- Create: `apps/worker/src/runtime/materialize.ts`
- Test: `apps/worker/tests/runtime/materialize.test.ts`

**Interfaces:**
- Consumes: `getBrandById`, `listBrandAssets`, `brandConfigFromRow`, `assetLocalPath`, `StorageClient`, `BUCKETS`, `MemoryStorage`, `createTestDb`, `seedTestBrand`.
- Produces: `materializeBrand(db: Db, storage: StorageClient, brandId: string, tmpRoot: string): Promise<{ brand: BrandConfig; cleanup(): Promise<void> }>`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MemoryStorage } from "@carepost/core";
import { createTestDb, seedTestBrand } from "@carepost/core/testing";
import { materializeBrand } from "../../src/runtime/materialize.js";

describe("materializeBrand", () => {
  it("downloads assets into a temp brand dir and cleans up", async () => {
    const { db } = await createTestDb();
    const brandId = await seedTestBrand(db, { slug: "kuanyin" });
    const storage = new MemoryStorage();
    await storage.upload("brand-assets", `${brandId}/logo/logo.png`, Buffer.from("L"), "image/png");
    await storage.upload("brand-assets", `${brandId}/product/serum.jpg`, Buffer.from("S"), "image/jpeg");
    await db.query("insert into brand_assets (brand_id, kind, storage_path, label) values ($1,'logo',$2,null), ($1,'product',$3,'Serum')",
      [brandId, `${brandId}/logo/logo.png`, `${brandId}/product/serum.jpg`]);

    const { brand, cleanup } = await materializeBrand(db, storage, brandId, os.tmpdir());
    expect(fs.readFileSync(path.join(brand.brandDir, "assets/logo.png"), "utf8")).toBe("L");
    expect(fs.readFileSync(path.join(brand.brandDir, "assets/products/serum.jpg"), "utf8")).toBe("S");
    expect(brand.productPhotos).toEqual([{ path: "assets/products/serum.jpg", label: "Serum" }]);
    await cleanup();
    expect(fs.existsSync(brand.brandDir)).toBe(false);
  });

  it("throws for an unknown brand", async () => {
    const { db } = await createTestDb();
    await expect(materializeBrand(db, new MemoryStorage(), "00000000-0000-4000-8000-000000000000", os.tmpdir()))
      .rejects.toThrow(/brand not found/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/worker && npx vitest run tests/runtime/materialize.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
import fs from "node:fs/promises";
import path from "node:path";
import {
  BUCKETS, assetLocalPath, brandConfigFromRow, getBrandById, listBrandAssets,
  type BrandConfig, type Db, type StorageClient,
} from "@carepost/core";

export async function materializeBrand(
  db: Db, storage: StorageClient, brandId: string, tmpRoot: string
): Promise<{ brand: BrandConfig; cleanup(): Promise<void> }> {
  const row = await getBrandById(db, brandId);
  if (!row) throw new Error(`brand not found: ${brandId}`);
  const assets = await listBrandAssets(db, brandId);
  const dir = await fs.mkdtemp(path.join(tmpRoot, `brand-${row.slug}-`));
  const cleanup = () => fs.rm(dir, { recursive: true, force: true });
  try {
    for (const a of assets) {
      const local = path.join(dir, assetLocalPath(a));
      await fs.mkdir(path.dirname(local), { recursive: true });
      await fs.writeFile(local, await storage.download(BUCKETS.assets, a.storage_path));
    }
    return { brand: brandConfigFromRow(row, assets, dir), cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}
```

- [ ] **Step 4: Run the test**

Run: `cd apps/worker && npx vitest run tests/runtime/materialize.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/runtime apps/worker/tests/runtime
git commit -m "feat(worker): materialise brand assets per run

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Worker tools on Postgres (async repo, brand-scoped)

**Files:**
- Modify: `apps/worker/src/tools/{recent-posts,post-performance,hot-topics,trending-topics,scrape-hot-topics,ingest-analytics}.ts`, `apps/worker/src/orchestrator.ts` (imports, `Db` type, `brand.dbId` in repo calls, awaits)
- Move: `apps/worker/src/db/schema.ts` → `apps/worker/scripts/legacy/sqlite-schema.ts`
- Delete: `apps/worker/src/db/queries.ts`, `apps/worker/tests/db/schema.test.ts`
- Rewrite: `apps/worker/tests/db/queries.test.ts` → delete (covered by core `repo.test.ts`); `apps/worker/tests/tools/recent-posts.test.ts`, `apps/worker/tests/tools/post-performance.test.ts`, `apps/worker/tests/e2e/dry-run.test.ts`, `apps/worker/tests/orchestrator.test.ts` (PGlite)
- Modify: `apps/worker/tsconfig.json` (`include`)

**Interfaces:**
- Consumes: the Task 4 repo functions and `createTestDb`/`seedTestBrand`.
- Produces:
  - `getRecentPostsTool(db: Db, brandId: string, limit: number): Promise<string>`
  - `getPostPerformanceTool(db: Db, brandId: string, limit: number): Promise<string>`
  - `getHotTopics(db: Db, brandId: string, input?): Promise<string>`
  - `getTrendingTopics(db: Db, brand: BrandConfig, input?)` (uses `brand.dbId`)
  - `scrapeAllSources(db: Db, brandId: string, sources: HotTopicSource[]): Promise<ScrapeStat[]>`
  - `ingestAnalytics(brand: BrandConfig, db: Db)`
  - `buildTools(brand: BrandConfig, db: Db)` (Task 9 adds a third `ctx` parameter)

- [ ] **Step 1: Rewrite the recent-posts test** (`apps/worker/tests/tools/recent-posts.test.ts`)

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { insertPost, type Db } from "@carepost/core";
import { createTestDb, seedTestBrand } from "@carepost/core/testing";
import { getRecentPostsTool } from "../../src/tools/recent-posts.js";

let db: Db;
let brand: string;
beforeEach(async () => {
  ({ db } = await createTestDb());
  brand = await seedTestBrand(db);
  for (const caption of ["Amazing AI results!", "Tips for better headshots"]) {
    await insertPost(db, { brand_id: brand, kind: "core", status: "published", planned_at: new Date(), caption,
      hashtags: ["#ai"], media: [{ storage_path: "x/0.png" }], prompt_ids: [], rationale: "" });
  }
});

describe("getRecentPostsTool", () => {
  it("returns formatted recent posts", async () => {
    const result = await getRecentPostsTool(db, brand, 5);
    expect(result).toContain("Amazing AI results!");
    expect(result).toContain("Tips for better headshots");
    expect(result).toContain("core · published");
  });
  it("handles no posts", async () => {
    const other = await seedTestBrand(db);
    expect(await getRecentPostsTool(db, other, 5)).toContain("No recent posts");
  });
});
```

Rewrite `tests/tools/post-performance.test.ts` the same way. Keep every existing assertion; replace setup with `createTestDb` + `seedTestBrand`, `insertPost` (status `published`, `published_at` set) and `insertAnalytics` with `post_id` as the returned uuid; `await` the tool.

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/worker && npx vitest run tests/tools/recent-posts.test.ts`. Expected: FAIL (tool still expects SQLite).

- [ ] **Step 3: Port the tools**

`apps/worker/src/tools/recent-posts.ts`:
```ts
import { getRecentPosts, type Db } from "@carepost/core";

export async function getRecentPostsTool(db: Db, brandId: string, limit: number): Promise<string> {
  const posts = await getRecentPosts(db, brandId, limit);
  if (posts.length === 0) return `No recent posts found for this brand.`;
  const formatted = posts
    .map((p) =>
      `[${(p.published_at ?? p.planned_at).toISOString()}] ${p.kind} · ${p.status}\nCaption: ${p.caption}\nMedia: ${p.media.length} image(s)\nHashtags: ${p.hashtags.join(", ")}`)
    .join("\n\n");
  return `Recent ${posts.length} posts:\n\n${formatted}`;
}
```

Make these mechanical edits (the function bodies otherwise stay the same):
- `post-performance.ts`: `import { getPostPerformance, type Db } from "@carepost/core";`. Make the function `async` returning `Promise<string>`, with `const pool = await getPostPerformance(db, brandId, …)`.
- `hot-topics.ts`: import `getTrendsSince, getSourceBaselines, type Db` from `@carepost/core`. The signature becomes `export async function getHotTopics(db: Db, brandId: string, input: GetHotTopicsInput = {}): Promise<string>`, with `await getTrendsSince(db, brandId, {...})` and `await getSourceBaselines(db, brandId)`.
- `trending-topics.ts`: `const items = await getTrendsSince(db, brand.dbId, { lookbackHours: lookback_hours });` and `db: Db`.
- `scrape-hot-topics.ts`: each `fetchX(source, db)` becomes `fetchX(source, db, brandId)`, and each `upsertTrend(db, {...})` becomes `await upsertTrend(db, brandId, {...})`. `scrapeAllSources(db: Db, brandId: string, sources: HotTopicSource[])` drops `loadSourcesConfig(configPath)` and uses `sources` directly (`cfg.sources` → `sources`). `loadSourcesConfig` stays exported.
- `ingest-analytics.ts`: `db: Db`; `brand.id` → `brand.dbId` in repo calls; every repo call is `await`ed; post ids are `string`.
- `orchestrator.ts`:
  - Replace `import Database from "better-sqlite3"` and the `./db/queries.js` import with `import { insertCompetitorSnapshot, getUsedPromptIds, type Db } from "@carepost/core";`.
  - Change `db: Database.Database` → `db: Db` in `buildTools`/`runAgent`.
  - Every repo/tool call gets `await` and `brand.dbId`: `await insertCompetitorSnapshot(db, { brand_id: brand.dbId, ... })`, `getRecentPostsTool(db, brand.dbId, …)`, `getPostPerformanceTool(db, brand.dbId, …)`, `getHotTopics(db, brand.dbId, input)`, `await getUsedPromptIds(db, brand.dbId)`.
  - Remove the `insertContentCalendarEntry`/`updateContentCalendarStatus`/`insertPost` use inside `schedule_post` by deleting the `schedule_post` tool entirely. Task 9 adds `save_post`.
  - Remove the `ingestAnalytics` call from `runAgent` (Task 11 calls it via the publisher).

Then:
```bash
mkdir -p apps/worker/scripts/legacy
git mv apps/worker/src/db/schema.ts apps/worker/scripts/legacy/sqlite-schema.ts
git rm apps/worker/src/db/queries.ts apps/worker/tests/db/queries.test.ts apps/worker/tests/db/schema.test.ts
```

In `apps/worker/package.json`, move `better-sqlite3` and `@types/better-sqlite3` to `devDependencies` (only the one-off import script uses them, so the production image needs no native SQLite build).

Set `apps/worker/tsconfig.json` `"include"` to `["src/**/*", "tests/**/*", "scripts/lib/**/*", "scripts/legacy/**/*", "scripts/seed-brand.ts", "scripts/migrate-sqlite.ts"]`. The other one-off scripts in `scripts/` predate the move and are no longer type-checked. List the ones that import `src/db/*` or `schedule-post` with `grep -l "src/db/\|schedule-post" apps/worker/scripts/*.ts` and paste that list into the commit message body as "legacy scripts no longer runnable".

- [ ] **Step 4: Port the orchestrator and dry-run tests**

In `tests/orchestrator.test.ts` and `tests/e2e/dry-run.test.ts`, replace `createDatabase(":memory:")` with:

```ts
import { createTestDb, seedTestBrand } from "@carepost/core/testing";
// inside each test:
const { db } = await createTestDb();
const dbId = await seedTestBrand(db);
const tools = buildTools({ ...mockBrand, dbId }, db);
```

Remove `db.close()` calls. Drop any assertion that `schedule_post` exists (Task 9 asserts `save_post`).

- [ ] **Step 5: Run the worker suite and typecheck**

Run: `cd apps/worker && npx vitest run && npx tsc --noEmit -p . 2>&1 | grep -c "error TS"`
Expected: tests PASS; error count ≤ `BASELINE_TS_ERRORS`.

- [ ] **Step 6: Commit**

```bash
git add -A apps/worker
git commit -m "refactor(worker): tools and orchestrator on async Postgres repo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Run windows and briefs

**Files:**
- Create: `apps/worker/src/runtime/types.ts`, `apps/worker/src/runtime/windows.ts`
- Test: `apps/worker/tests/runtime/windows.test.ts`

**Interfaces:**
- Consumes: `coreSlots`, `zonedTimeToUtc`, `addDaysYmd`, `localParts`, `mondayOfIsoWeek`, `formatLocal`, `RunKind`, `BrandConfig`, `StorageClient`.
- Produces:
  - `interface RunWindow { start: Date; end: Date }`
  - `type NotifyFn = (subject: string, body: string, to: string[]) => Promise<unknown>`
  - `interface ToolContext { storage: StorageClient; runId: string | null; kind: RunKind; window: RunWindow; notify: NotifyFn }`
  - `runWindow(brand: BrandConfig, kind: RunKind, periodKey: string, now: Date): RunWindow`
  - `buildBrief(brand: BrandConfig, kind: RunKind, periodKey: string, now: Date, userBrief?: string): string`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import type { BrandConfig } from "@carepost/core";
import { runWindow, buildBrief } from "../../src/runtime/windows.js";

const brand = {
  name: "Kuanyin Skin", timezone: "Europe/Brussels",
  postingSchedule: { coreDays: ["mon", "tue", "wed", "thu", "fri"], defaultTime: "10:00" },
} as unknown as BrandConfig;

describe("runWindow", () => {
  it("weekly_plan covers the local ISO week", () => {
    const w = runWindow(brand, "weekly_plan", "2026-W43", new Date("2026-10-18T07:00:00Z"));
    expect(w.start.toISOString()).toBe("2026-10-18T22:00:00.000Z"); // Mon 00:00 CEST
    expect(w.end.toISOString()).toBe("2026-10-25T23:00:00.000Z");   // next Mon 00:00 CET (DST ended)
  });
  it("daily_check runs from now+2h to end of tomorrow", () => {
    const now = new Date("2026-10-19T06:00:00Z");
    const w = runWindow(brand, "daily_check", "2026-10-19", now);
    expect(w.start.toISOString()).toBe("2026-10-19T08:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-10-20T22:00:00.000Z");
  });
  it("manual allows the next 14 days", () => {
    const now = new Date("2026-10-19T06:00:00Z");
    const w = runWindow(brand, "manual", "m", now);
    expect(w.start.getTime() - now.getTime()).toBe(15 * 60_000);
    expect(w.end.getTime() - now.getTime()).toBe(14 * 86400_000);
  });
});

describe("buildBrief", () => {
  it("lists concrete local slots for the weekly plan", () => {
    const brief = buildBrief(brand, "weekly_plan", "2026-W43", new Date("2026-10-18T07:00:00Z"));
    expect(brief).toContain("Mon 2026-10-19 10:00");
    expect(brief).toContain("Fri 2026-10-23 10:00");
    expect(brief).toContain("2026-10-19T08:00:00.000Z");
    expect(brief).toContain("save_post");
  });
  it("tells the daily check to save at most one timely post", () => {
    const brief = buildBrief(brand, "daily_check", "2026-10-19", new Date("2026-10-19T06:00:00Z"));
    expect(brief).toMatch(/at most ONE timely post/);
    expect(brief).toContain("get_planned_posts");
  });
  it("uses the user brief for manual runs", () => {
    expect(buildBrief(brand, "manual", "m", new Date(), "Do X")).toContain("Do X");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/worker && npx vitest run tests/runtime/windows.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

`apps/worker/src/runtime/types.ts`:
```ts
import type { RunKind, StorageClient } from "@carepost/core";
export interface RunWindow { start: Date; end: Date }
export type NotifyFn = (subject: string, body: string, to: string[]) => Promise<unknown>;
export interface ToolContext { storage: StorageClient; runId: string | null; kind: RunKind; window: RunWindow; notify: NotifyFn }
```

`apps/worker/src/runtime/windows.ts`:
```ts
import {
  addDaysYmd, coreSlots, formatLocal, localParts, mondayOfIsoWeek, zonedTimeToUtc,
  type BrandConfig, type RunKind,
} from "@carepost/core";
import type { RunWindow } from "./types.js";

export function runWindow(brand: BrandConfig, kind: RunKind, periodKey: string, now: Date): RunWindow {
  const tz = brand.timezone;
  if (kind === "weekly_plan") {
    const monday = mondayOfIsoWeek(periodKey);
    return { start: zonedTimeToUtc(monday, "00:00", tz), end: zonedTimeToUtc(addDaysYmd(monday, 7), "00:00", tz) };
  }
  if (kind === "daily_check") {
    const today = localParts(now, tz).ymd;
    return { start: new Date(now.getTime() + 2 * 3600_000), end: zonedTimeToUtc(addDaysYmd(today, 2), "00:00", tz) };
  }
  return { start: new Date(now.getTime() + 15 * 60_000), end: new Date(now.getTime() + 14 * 86400_000) };
}

export function buildBrief(brand: BrandConfig, kind: RunKind, periodKey: string, now: Date, userBrief?: string): string {
  const tz = brand.timezone;
  const w = runWindow(brand, kind, periodKey, now);
  const windowLine = `Allowed plannedAt window: ${w.start.toISOString()} → ${w.end.toISOString()} (UTC). Brand timezone: ${tz}. Local time now: ${formatLocal(now, tz)}.`;
  if (kind === "weekly_plan") {
    const slots = coreSlots(periodKey, brand.postingSchedule.coreDays, brand.postingSchedule.defaultTime, tz);
    const list = slots.map((s) => `- ${formatLocal(s.at, tz)} local → plannedAt ${s.at.toISOString()}`).join("\n");
    return `Plan and draft the CORE posts for ${brand.name} for ISO week ${periodKey}.
${windowLine}
First call get_planned_posts to see what already exists (including timely posts). Then draft one core post for each slot below that does not already have a core post:
${list}
Save each with save_post (kind "core", plannedAt exactly as listed, a one-paragraph rationale). Do not publish anything; drafts go to the brand for review. Send a summary notification at the end.`;
  }
  if (kind === "daily_check") {
    return `Daily check for ${brand.name} (${periodKey}).
${windowLine}
Call get_planned_posts, then check today's hot topics and trends. Only if there is a strong, on-brand moment, draft at most ONE timely post for today or tomorrow and save it with save_post (kind "timely"). Otherwise save nothing and explain why in your final message.`;
  }
  return `${userBrief ?? `Manual run for ${brand.name}.`}
${windowLine}
Use save_post for anything you create (kind "core" unless told otherwise).`;
}
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/worker && npx vitest run tests/runtime/windows.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/runtime apps/worker/tests/runtime
git commit -m "feat(worker): run windows and per-kind briefs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: `save_post`, `get_planned_posts`, notify recipients, prompt changes

**Files:**
- Create: `apps/worker/src/tools/save-post.ts`, `apps/worker/src/tools/planned-posts.ts`
- Modify: `apps/worker/src/tools/notify.ts`; `apps/worker/src/orchestrator.ts` (`buildTools(brand, db, ctx)`, new tools, `runAgent` options/result); `apps/worker/src/config/system-prompt.ts` (rename `schedule_post`→`save_post`, product-photos section)
- Test: `apps/worker/tests/tools/save-post.test.ts`, `apps/worker/tests/tools/notify.test.ts` (add case), `apps/worker/tests/orchestrator.test.ts`, `apps/worker/tests/config/system-prompt.test.ts` (add case)

**Interfaces:**
- Consumes: `ToolContext`, `RunWindow` (Task 8); `insertPost`, `countRunPosts`, `hasCorePostOnLocalDate`, `getPlannedPosts`, `getBrandNotifyEmails`, `BUCKETS`, `localParts`, `formatLocal`.
- Produces:
  - `interface SavePostInput { caption: string; hashtags: string[]; images: string[]; promptIds: string[]; plannedAt: string; kind: "core" | "timely"; rationale: string }`
  - `savePost(db: Db, brand: BrandConfig, ctx: ToolContext, input: SavePostInput): Promise<string>`
  - `formatPlannedPosts(rows: PostRow[], tz: string): string`
  - `sendNotification(subject: string, body: string, opts?: { to?: string[] }): Promise<string>`
  - `buildTools(brand: BrandConfig, db: Db, ctx: ToolContext)`
  - `runAgent(brand: BrandConfig, db: Db, opts: RunAgentOptions): Promise<RunAgentResult>`, where `RunAgentOptions = { kind: RunKind; periodKey: string; now?: Date; userBrief?: string; maxIterations?: number; toolContext: ToolContext }` and `RunAgentResult = { summary: string; inputTokens: number; outputTokens: number; imageCount: number }`

- [ ] **Step 1: Write the failing `save_post` tests** (`apps/worker/tests/tools/save-post.test.ts`)

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MemoryStorage, enqueueRun, type BrandConfig, type Db } from "@carepost/core";
import { createTestDb, seedTestBrand, addTestMember } from "@carepost/core/testing";
import { savePost } from "../../src/tools/save-post.js";
import type { ToolContext } from "../../src/runtime/types.js";

let db: Db;
let storage: MemoryStorage;
let brand: BrandConfig;
let img: string;
const notify = vi.fn().mockResolvedValue("ok");

const window = { start: new Date("2026-10-18T22:00:00Z"), end: new Date("2026-10-25T23:00:00Z") };
const input = (o = {}) => ({
  caption: "Barrier care", hashtags: ["#skin"], images: [img], promptIds: [],
  plannedAt: "2026-10-19T08:00:00.000Z", kind: "core" as const, rationale: "why", ...o,
});

async function setup(approvalMode: "review" | "autopilot") {
  ({ db } = await createTestDb());
  const dbId = await seedTestBrand(db, { approval_mode: approvalMode });
  await addTestMember(db, dbId, "owner@kuanyin.be");
  brand = { dbId, slug: "k", name: "K", timezone: "Europe/Brussels", approvalMode } as unknown as BrandConfig;
  storage = new MemoryStorage();
  img = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "img-")), "slide.png");
  fs.writeFileSync(img, "PNG");
  notify.mockClear();
}
const ctx = (o: Partial<ToolContext> = {}): ToolContext => ({ storage, runId: null, kind: "weekly_plan", window, notify, ...o });
const rows = () => db.query("select * from posts order by planned_at");

describe("savePost", () => {
  beforeEach(() => setup("review"));

  it("uploads media then inserts a pending draft", async () => {
    const msg = await savePost(db, brand, ctx(), input());
    const [p] = await rows();
    expect(msg).toContain(p.id);
    expect(p.status).toBe("pending_approval");
    expect(p.media).toEqual([{ storage_path: `${brand.dbId}/${p.id}/0.png` }]);
    expect(storage.files.get(`post-media/${brand.dbId}/${p.id}/0.png`)?.contentType).toBe("image/png");
  });

  it("rejects plannedAt outside the run window", async () => {
    const msg = await savePost(db, brand, ctx(), input({ plannedAt: "2026-11-02T08:00:00Z" }));
    expect(msg).toMatch(/outside the allowed window/);
    expect(await rows()).toHaveLength(0);
  });

  it("refuses a second core post on the same local date (weekly retry)", async () => {
    await savePost(db, brand, ctx(), input());
    const msg = await savePost(db, brand, ctx(), input({ plannedAt: "2026-10-19T15:00:00Z" }));
    expect(msg).toMatch(/already has a core post/);
    await savePost(db, brand, ctx(), input({ plannedAt: "2026-10-20T08:00:00Z" }));
    expect(await rows()).toHaveLength(2);
  });

  it("allows at most one timely post per daily run and notifies members in review mode", async () => {
    const runId = await enqueueRun(db, brand.dbId, "daily_check", "2026-10-19");
    const c = ctx({ kind: "daily_check", runId });
    await savePost(db, brand, c, input({ kind: "timely" }));
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("needs your OK"), expect.any(String), ["owner@kuanyin.be"]);
    const msg = await savePost(db, brand, c, input({ kind: "timely", plannedAt: "2026-10-19T12:00:00Z" }));
    expect(msg).toMatch(/at most one timely post/);
    expect(await rows()).toHaveLength(1);
  });

  it("rejects a core post from a daily check", async () => {
    expect(await savePost(db, brand, ctx({ kind: "daily_check" }), input())).toMatch(/must be "timely"/);
  });

  it("leaves no row when an upload fails", async () => {
    storage.failUploads = true;
    const msg = await savePost(db, brand, ctx(), input());
    expect(msg).toMatch(/save_post failed/);
    expect(await rows()).toHaveLength(0);
  });

  it("approves immediately in autopilot without notifying", async () => {
    await setup("autopilot");
    const runId = await enqueueRun(db, brand.dbId, "daily_check", "2026-10-19");
    await savePost(db, brand, ctx({ kind: "daily_check", runId }), input({ kind: "timely" }));
    expect((await rows())[0].status).toBe("approved");
    expect(notify).not.toHaveBeenCalled();
  });
});
```

Add to `tests/tools/notify.test.ts`:
```ts
it("sends to explicit recipients when given", async () => {
  const result = await sendNotification("Timely post", "body", { to: ["a@x.be", "b@x.be"] });
  expect(result).toContain("a@x.be, b@x.be");
});
```

Add to `tests/config/system-prompt.test.ts` (using the file's existing brand fixture, here called `baseBrand`):
```ts
it("lists product photos and never mentions schedule_post", () => {
  const prompt = buildSystemPrompt({ ...baseBrand, productPhotos: [{ path: "assets/products/serum.jpg", label: "Rosehip serum" }] });
  expect(prompt).toContain("Rosehip serum");
  expect(prompt).toContain("assets/products/serum.jpg");
  expect(prompt).not.toContain("schedule_post");
});
```

In `tests/orchestrator.test.ts`, add:
```ts
it("registers save_post and get_planned_posts instead of schedule_post", async () => {
  const { db } = await createTestDb();
  const dbId = await seedTestBrand(db);
  const ctx = { storage: new MemoryStorage(), runId: null, kind: "manual" as const,
    window: { start: new Date(), end: new Date(Date.now() + 86400_000) }, notify: async () => "" };
  const names = buildTools({ ...mockBrand, dbId }, db, ctx).map((t) => t.name);
  expect(names).toContain("save_post");
  expect(names).toContain("get_planned_posts");
  expect(names).not.toContain("schedule_post");
});
```
Also pass the same `ctx` to every other `buildTools(...)` call in the orchestrator and dry-run tests.

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/worker && npx vitest run tests/tools/save-post.test.ts tests/tools/notify.test.ts tests/orchestrator.test.ts tests/config/system-prompt.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `save-post.ts` and `planned-posts.ts`**

`apps/worker/src/tools/save-post.ts`:
```ts
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  BUCKETS, countRunPosts, formatLocal, getBrandNotifyEmails, hasCorePostOnLocalDate, insertPost, localParts,
  type BrandConfig, type Db, type MediaItem,
} from "@carepost/core";
import type { ToolContext } from "../runtime/types.js";

export interface SavePostInput {
  caption: string; hashtags: string[]; images: string[]; promptIds: string[];
  plannedAt: string; kind: "core" | "timely"; rationale: string;
}

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

async function readImage(src: string): Promise<{ bytes: Buffer; ext: string }> {
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`fetch ${src}: HTTP ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    const ext = Object.keys(TYPES).find((k) => TYPES[k] === type.split(";")[0]) ?? "png";
    return { bytes: Buffer.from(await res.arrayBuffer()), ext: ext === "jpeg" ? "jpg" : ext };
  }
  const raw = path.extname(src).slice(1).toLowerCase();
  const ext = raw in TYPES ? (raw === "jpeg" ? "jpg" : raw) : "png";
  return { bytes: await fs.readFile(src), ext };
}

export async function savePost(db: Db, brand: BrandConfig, ctx: ToolContext, input: SavePostInput): Promise<string> {
  const plannedAt = new Date(input.plannedAt);
  if (Number.isNaN(plannedAt.getTime())) return `save_post rejected: plannedAt "${input.plannedAt}" is not an ISO timestamp.`;
  if (plannedAt < ctx.window.start || plannedAt >= ctx.window.end)
    return `save_post rejected: plannedAt ${plannedAt.toISOString()} is outside the allowed window ${ctx.window.start.toISOString()} → ${ctx.window.end.toISOString()}.`;
  if (input.images.length < 1 || input.images.length > 10) return "save_post rejected: provide 1–10 images.";

  if (ctx.kind === "daily_check") {
    if (input.kind !== "timely") return `save_post rejected: posts from a daily check must be "timely".`;
    if (ctx.runId && (await countRunPosts(db, ctx.runId)) >= 1)
      return "save_post rejected: a daily check may save at most one timely post.";
  }
  if (ctx.kind === "weekly_plan" && input.kind !== "core") return `save_post rejected: posts from the weekly plan must be "core".`;
  if (input.kind === "core") {
    const ymd = localParts(plannedAt, brand.timezone).ymd;
    if (await hasCorePostOnLocalDate(db, brand.dbId, brand.timezone, ymd))
      return `save_post rejected: ${ymd} already has a core post. Check get_planned_posts.`;
  }

  const id = randomUUID();
  let media: MediaItem[];
  try {
    media = [];
    for (const [n, src] of input.images.entries()) {
      const { bytes, ext } = await readImage(src);
      const storage_path = `${brand.dbId}/${id}/${n}.${ext}`;
      await ctx.storage.upload(BUCKETS.media, storage_path, bytes, TYPES[ext]);
      media.push({ storage_path });
    }
    await insertPost(db, {
      id, brand_id: brand.dbId, run_id: ctx.runId, kind: input.kind,
      status: brand.approvalMode === "autopilot" ? "approved" : "pending_approval",
      planned_at: plannedAt, caption: input.caption, hashtags: input.hashtags, media,
      prompt_ids: input.promptIds, rationale: input.rationale,
    });
  } catch (err) {
    return `save_post failed: ${err instanceof Error ? err.message : String(err)}. Nothing was saved; you may retry.`;
  }

  const when = formatLocal(plannedAt, brand.timezone);
  if (input.kind === "timely" && brand.approvalMode === "review") {
    const to = await getBrandNotifyEmails(db, brand.dbId);
    if (to.length > 0) {
      await ctx.notify(`1 timely post needs your OK by ${when}`,
        `${brand.name}: a timely post is waiting for approval before ${when} (${brand.timezone}).\n\n${input.caption}`, to);
    }
  }
  return `Saved ${input.kind} post ${id} for ${when} (${brand.approvalMode === "autopilot" ? "approved" : "pending approval"}).`;
}
```

`apps/worker/src/tools/planned-posts.ts`:
```ts
import { formatLocal, type PostRow } from "@carepost/core";

export function formatPlannedPosts(rows: PostRow[], tz: string): string {
  if (rows.length === 0) return "No planned posts in the next 7 days.";
  return rows
    .map((p) => `- ${formatLocal(p.planned_at, tz)} · ${p.kind} · ${p.status} · ${p.caption.split("\n")[0].slice(0, 100)}`)
    .join("\n");
}
```

- [ ] **Step 4: Extend `notify.ts`**

Change the signature to `sendNotification(subject: string, body: string, opts: { to?: string[] } = {})`. Compute `const recipients = opts.to && opts.to.length > 0 ? opts.to : notifyEmail ? [notifyEmail] : [];`. The console fallback condition becomes `!smtpHost || recipients.length === 0`. Use `to: recipients.join(", ")` in `sendMail`, and return `Notification sent to ${recipients.join(", ")}: "${subject}"`.

- [ ] **Step 5: Wire up the orchestrator**

In `apps/worker/src/orchestrator.ts`:
- Change the signature to `export function buildTools(brand: BrandConfig, db: Db, ctx: ToolContext)`.
- Where `schedule_post` used to be, add:

```ts
betaZodTool({
  name: "save_post",
  description: "Save a finished post as a DRAFT for this brand (it is never published directly). Upload happens automatically. plannedAt must be inside the window given in the run brief. MUST pass promptIds of any prompt-bank images used.",
  inputSchema: z.object({
    caption: z.string(),
    hashtags: z.array(z.string()),
    images: z.array(z.string()).describe("Local paths or URLs. One = single image, several = carousel (max 10)."),
    promptIds: z.array(z.string()).describe("Prompt-bank IDs used, empty if none."),
    plannedAt: z.string().describe("ISO timestamp (UTC) for when the post should go out."),
    kind: z.enum(["core", "timely"]),
    rationale: z.string().describe("One paragraph: why this post, why now."),
  }),
  run: async (input) => savePost(db, brand, ctx, input),
}),

betaZodTool({
  name: "get_planned_posts",
  description: "List this brand's upcoming drafts and scheduled posts for the next 7 days, so you don't duplicate them.",
  inputSchema: z.object({}),
  run: async () => {
    const now = new Date();
    return formatPlannedPosts(await getPlannedPosts(db, brand.dbId, now, new Date(now.getTime() + 7 * 86400_000)), brand.timezone);
  },
}),
```

- Replace `runAgent`'s signature and body head with:

```ts
export interface RunAgentOptions {
  kind: RunKind; periodKey: string; now?: Date; userBrief?: string; maxIterations?: number; toolContext: ToolContext;
}
export interface RunAgentResult { summary: string; inputTokens: number; outputTokens: number; imageCount: number }

export async function runAgent(brand: BrandConfig, db: Db, opts: RunAgentOptions): Promise<RunAgentResult> {
  const client = new Anthropic();
  const tools = buildTools(brand, db, opts.toolContext);
  const systemPrompt = buildSystemPrompt(brand);
  const userBrief = buildBrief(brand, opts.kind, opts.periodKey, opts.now ?? new Date(), opts.userBrief);
```

- Inside the existing `for await` loop, accumulate `inputTokens += msg.usage?.input_tokens ?? 0; outputTokens += msg.usage?.output_tokens ?? 0; imageCount += toolUses.filter((t: any) => t.name === "generate_image").length;`.
- At the end, `return { summary: textBlock?.text ?? "", inputTokens, outputTokens, imageCount };`.
- Keep the model id, `max_tokens`, `thinking` and logging unchanged.

- [ ] **Step 6: System prompt edits** (mechanics only; creative guidance unchanged)

In `apps/worker/src/config/system-prompt.ts`:
- Replace every `schedule_post` with `save_post` (6 occurrences; check with `grep -n schedule_post`).
- In step 7, replace "and schedule via save_post" with "and save it as a draft via save_post", and "Generate and schedule the picked concept" with "Generate the picked concept and save it via save_post".
- Replace the sentence "When scheduling posts, always pick a time at least 30 minutes in the future from the current time above. Never schedule in the past." with "When saving posts, plannedAt must be inside the window stated in the run brief."
- Append before `return prompt;`:

```ts
  if (brand.productPhotos.length > 0) {
    prompt += `

## Product photos
The brand uploaded real product photos. Use them as-is (photo_overlay, brand_image or carousel slides) whenever a post features the product. Never present an AI-generated image as the real product.
${brand.productPhotos.map((p) => `- ${p.label}: ${p.path}`).join("\n")}`;
  }
```

- [ ] **Step 7: Run the worker suite and typecheck**

Run: `cd apps/worker && npx vitest run && npx tsc --noEmit -p . 2>&1 | grep -c "error TS"`
Expected: PASS; error count ≤ baseline.

- [ ] **Step 8: Commit**

```bash
git add -A apps/worker
git commit -m "feat(worker): save_post drafts with duplicate guards, get_planned_posts, member notifications

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Scheduler

**Files:**
- Create: `apps/worker/src/runtime/scheduler.ts`
- Test: `apps/worker/tests/runtime/scheduler.test.ts`

**Interfaces:**
- Consumes: `localParts`, `zonedTimeToUtc`, `addDaysYmd`, `isoWeekKey`, `listActiveBrands`, `enqueueRun`.
- Produces: `dueRuns(now: Date, tz: string): { kind: "weekly_plan" | "daily_check"; periodKey: string }[]` and `schedulerTick(db: Db, now: Date): Promise<number>` (number of newly enqueued runs)

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { createTestDb, seedTestBrand } from "@carepost/core/testing";
import { dueRuns, schedulerTick } from "../../src/runtime/scheduler.js";

const BXL = "Europe/Brussels";
const at = (s: string) => new Date(s);

describe("dueRuns", () => {
  it("fires weekly + daily on Sunday morning (CEST)", () => {
    expect(dueRuns(at("2026-10-18T07:30:00Z"), BXL)).toEqual([
      { kind: "daily_check", periodKey: "2026-10-18" },
      { kind: "weekly_plan", periodKey: "2026-W43" },
    ]);
  });
  it("fires nothing before 08:00 local", () => {
    expect(dueRuns(at("2026-10-18T05:00:00Z"), BXL)).toEqual([]);
  });
  it("skips runs more than 6h late", () => {
    expect(dueRuns(at("2026-10-18T13:30:00Z"), BXL)).toEqual([]);
  });
  it("uses local time on the March DST day", () => {
    expect(dueRuns(at("2026-03-29T06:30:00Z"), BXL)).toEqual([{ kind: "daily_check", periodKey: "2026-03-29" }]);
    expect(dueRuns(at("2026-03-29T07:05:00Z"), BXL)).toEqual([
      { kind: "daily_check", periodKey: "2026-03-29" },
      { kind: "weekly_plan", periodKey: "2026-W14" },
    ]);
  });
  it("uses local time on the October DST day", () => {
    expect(dueRuns(at("2026-10-25T07:30:00Z"), BXL)).toEqual([{ kind: "daily_check", periodKey: "2026-10-25" }]);
    expect(dueRuns(at("2026-10-25T08:05:00Z"), BXL)).toEqual([
      { kind: "daily_check", periodKey: "2026-10-25" },
      { kind: "weekly_plan", periodKey: "2026-W44" },
    ]);
  });
  it("only fires the daily check on weekdays", () => {
    expect(dueRuns(at("2026-10-19T06:10:00Z"), BXL)).toEqual([{ kind: "daily_check", periodKey: "2026-10-19" }]);
  });
});

describe("schedulerTick", () => {
  it("is idempotent and skips paused brands", async () => {
    const { db } = await createTestDb();
    await seedTestBrand(db);
    await seedTestBrand(db, { status: "paused" });
    const now = at("2026-10-18T07:30:00Z");
    expect(await schedulerTick(db, now)).toBe(2);
    expect(await schedulerTick(db, now)).toBe(0);
    const [{ n }] = await db.query("select count(*)::int as n from agent_runs");
    expect(n).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/worker && npx vitest run tests/runtime/scheduler.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import { addDaysYmd, enqueueRun, isoWeekKey, listActiveBrands, localParts, zonedTimeToUtc, WEEKDAYS, type Db } from "@carepost/core";

const CATCH_UP_MS = 6 * 3600_000;
const inWindow = (now: Date, at: Date) => now >= at && now.getTime() - at.getTime() < CATCH_UP_MS;

export function dueRuns(now: Date, tz: string): { kind: "weekly_plan" | "daily_check"; periodKey: string }[] {
  const out: { kind: "weekly_plan" | "daily_check"; periodKey: string }[] = [];
  const { ymd, weekday } = localParts(now, tz);
  if (inWindow(now, zonedTimeToUtc(ymd, "08:00", tz))) out.push({ kind: "daily_check", periodKey: ymd });
  const sunday = addDaysYmd(ymd, -((WEEKDAYS.indexOf(weekday) + 1) % 7));
  if (inWindow(now, zonedTimeToUtc(sunday, "09:00", tz))) {
    out.push({ kind: "weekly_plan", periodKey: isoWeekKey(addDaysYmd(sunday, 1)) });
  }
  return out;
}

export async function schedulerTick(db: Db, now: Date): Promise<number> {
  let enqueued = 0;
  for (const brand of await listActiveBrands(db)) {
    for (const r of dueRuns(now, brand.timezone)) {
      if (await enqueueRun(db, brand.id, r.kind, r.periodKey)) enqueued++;
    }
  }
  return enqueued;
}
```

(`(indexOf + 1) % 7` gives 0 for Sunday, 1 for Monday, … 6 for Saturday: the number of days back to the most recent Sunday.)

- [ ] **Step 4: Run the tests**

Run: `cd apps/worker && npx vitest run tests/runtime/scheduler.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/runtime/scheduler.ts apps/worker/tests/runtime/scheduler.test.ts
git commit -m "feat(worker): timezone-aware run scheduler

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Run loop

**Files:**
- Create: `apps/worker/src/publishers/types.ts`, `apps/worker/src/runtime/run-loop.ts`
- Test: `apps/worker/tests/runtime/run-loop.test.ts`

**Interfaces:**
- Consumes: `materializeBrand` (Task 6), `runWindow` (Task 8), `runAgent` types (Task 9), `claimNextRun`, `heartbeatRun`, `finishRun`, `requeueRun`, `recoverStaleRuns`, `listBrandSources`, `getBrandNotifyEmails`.
- Produces:
  - `interface PublishablePost { id: string; brandId: string; caption: string; hashtags: string[]; mediaUrls: string[] }`
  - `interface Publisher { name: "postiz"; publish(post: PublishablePost): Promise<{ externalId: string }>; ingestMetrics?(brand: BrandConfig, db: Db): Promise<void> }`
  - `interface RunDeps { db: Db; storage: StorageClient; tmpRoot: string; agent: (brand: BrandConfig, db: Db, opts: RunAgentOptions) => Promise<RunAgentResult>; scrape: (db: Db, brandId: string, sources: any[]) => Promise<unknown>; publisherFor: (brand: BrandConfig) => Publisher | null; notify: (subject: string, body: string, to?: string[]) => Promise<unknown>; now: () => Date; heartbeatMs?: number; maxAttempts?: number }`
  - `executeRun(deps: RunDeps, run: RunRow): Promise<void>`
  - `runLoopTick(deps: RunDeps): Promise<boolean>` (recovers stale runs, then claims and executes one; returns whether it ran something)

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import { MemoryStorage, enqueueRun, claimNextRun, type Db } from "@carepost/core";
import { createTestDb, seedTestBrand } from "@carepost/core/testing";
import { executeRun, runLoopTick, type RunDeps } from "../../src/runtime/run-loop.js";

let db: Db;
let brandId: string;
let deps: RunDeps;
beforeEach(async () => {
  ({ db } = await createTestDb());
  brandId = await seedTestBrand(db, { publisher: "postiz" });
  await db.query("insert into brand_sources (brand_id, source) values ($1, $2::jsonb)", [brandId, JSON.stringify({ id: "hn" })]);
  deps = {
    db, storage: new MemoryStorage(), tmpRoot: os.tmpdir(),
    agent: vi.fn().mockResolvedValue({ summary: "done", inputTokens: 100, outputTokens: 20, imageCount: 2 }),
    scrape: vi.fn().mockResolvedValue([]),
    publisherFor: () => ({ name: "postiz", publish: vi.fn(), ingestMetrics: vi.fn().mockResolvedValue(undefined) }),
    notify: vi.fn().mockResolvedValue("ok"),
    now: () => new Date("2026-10-18T07:30:00Z"),
    heartbeatMs: 60_000,
  };
});
const runRow = async () => (await db.query("select * from agent_runs"))[0];

describe("executeRun", () => {
  it("scrapes, ingests metrics, runs the agent and records usage", async () => {
    await enqueueRun(db, brandId, "weekly_plan", "2026-W43");
    await executeRun(deps, (await claimNextRun(db))!);
    expect(deps.scrape).toHaveBeenCalledWith(db, brandId, [{ id: "hn" }]);
    const opts = (deps.agent as any).mock.calls[0][2];
    expect(opts).toMatchObject({ kind: "weekly_plan", periodKey: "2026-W43" });
    expect(opts.toolContext.window.start.toISOString()).toBe("2026-10-18T22:00:00.000Z");
    expect(await runRow()).toMatchObject({ status: "succeeded", summary: "done", input_tokens: 100, output_tokens: 20, image_count: 2 });
    const brandDir = (deps.agent as any).mock.calls[0][0].brandDir;
    expect(fs.existsSync(brandDir)).toBe(false); // temp dir cleaned up
  });

  it("continues when scraping fails", async () => {
    deps.scrape = vi.fn().mockRejectedValue(new Error("feed down"));
    await enqueueRun(db, brandId, "daily_check", "2026-10-18");
    await executeRun(deps, (await claimNextRun(db))!);
    expect((await runRow()).status).toBe("succeeded");
  });

  it("re-queues on agent error until the last attempt, then fails and notifies", async () => {
    deps.agent = vi.fn().mockRejectedValue(new Error("anthropic 529"));
    await enqueueRun(db, brandId, "daily_check", "2026-10-18");
    await executeRun(deps, (await claimNextRun(db))!);
    expect(await runRow()).toMatchObject({ status: "queued", error: "anthropic 529" });
    await executeRun(deps, (await claimNextRun(db))!);
    await executeRun(deps, (await claimNextRun(db))!);
    expect(await runRow()).toMatchObject({ status: "failed", attempts: 3 });
    expect(deps.notify).toHaveBeenCalledTimes(1);
  });
});

describe("runLoopTick", () => {
  it("recovers a crashed run and executes it", async () => {
    const id = await enqueueRun(db, brandId, "daily_check", "2026-10-18");
    await claimNextRun(db);
    await db.query("update agent_runs set heartbeat_at = now() - interval '11 minutes' where id = $1", [id]);
    expect(await runLoopTick(deps)).toBe(true);
    expect(await runRow()).toMatchObject({ status: "succeeded", attempts: 2 });
  });
  it("returns false when the queue is empty", async () => {
    expect(await runLoopTick(deps)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/worker && npx vitest run tests/runtime/run-loop.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

`apps/worker/src/publishers/types.ts`:
```ts
import type { BrandConfig, Db } from "@carepost/core";
export interface PublishablePost { id: string; brandId: string; caption: string; hashtags: string[]; mediaUrls: string[] }
export interface Publisher {
  name: "postiz";
  publish(post: PublishablePost): Promise<{ externalId: string }>;
  ingestMetrics?(brand: BrandConfig, db: Db): Promise<void>;
}
```

`apps/worker/src/runtime/run-loop.ts`:
```ts
import {
  claimNextRun, finishRun, heartbeatRun, listBrandSources, recoverStaleRuns, requeueRun,
  type BrandConfig, type Db, type RunRow, type StorageClient,
} from "@carepost/core";
import type { RunAgentOptions, RunAgentResult } from "../orchestrator.js";
import type { Publisher } from "../publishers/types.js";
import { materializeBrand } from "./materialize.js";
import { runWindow } from "./windows.js";

export interface RunDeps {
  db: Db;
  storage: StorageClient;
  tmpRoot: string;
  agent: (brand: BrandConfig, db: Db, opts: RunAgentOptions) => Promise<RunAgentResult>;
  scrape: (db: Db, brandId: string, sources: any[]) => Promise<unknown>;
  publisherFor: (brand: BrandConfig) => Publisher | null;
  notify: (subject: string, body: string, to?: string[]) => Promise<unknown>;
  now: () => Date;
  heartbeatMs?: number;
  maxAttempts?: number;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function executeRun(deps: RunDeps, run: RunRow): Promise<void> {
  const { db } = deps;
  const beat = setInterval(() => void heartbeatRun(db, run.id).catch(() => {}), deps.heartbeatMs ?? 30_000);
  let cleanup: (() => Promise<void>) | null = null;
  try {
    const m = await materializeBrand(db, deps.storage, run.brand_id, deps.tmpRoot);
    cleanup = m.cleanup;
    const brand = m.brand;

    try { await deps.scrape(db, brand.dbId, await listBrandSources(db, brand.dbId)); }
    catch (e) { console.warn(`[run ${run.id}] scrape failed (continuing): ${msg(e)}`); }

    const publisher = deps.publisherFor(brand);
    if (publisher?.ingestMetrics) {
      try { await publisher.ingestMetrics(brand, db); }
      catch (e) { console.warn(`[run ${run.id}] metrics ingest failed (continuing): ${msg(e)}`); }
    }

    const now = deps.now();
    const result = await deps.agent(brand, db, {
      kind: run.kind, periodKey: run.period_key, now,
      toolContext: {
        storage: deps.storage, runId: run.id, kind: run.kind,
        window: runWindow(brand, run.kind, run.period_key, now),
        notify: (s, b, to) => deps.notify(s, b, to),
      },
    });
    await finishRun(db, run.id, {
      status: "succeeded", summary: result.summary, inputTokens: result.inputTokens,
      outputTokens: result.outputTokens, imageCount: result.imageCount,
    });
  } catch (e) {
    if (run.attempts < (deps.maxAttempts ?? 3)) {
      await requeueRun(db, run.id, msg(e));
    } else {
      await finishRun(db, run.id, { status: "failed", error: msg(e) });
      await deps.notify(`Run failed: ${run.kind} ${run.period_key}`, `Run ${run.id} for brand ${run.brand_id} failed after ${run.attempts} attempts:\n${msg(e)}`);
    }
  } finally {
    clearInterval(beat);
    if (cleanup) await cleanup();
  }
}

export async function runLoopTick(deps: RunDeps): Promise<boolean> {
  await recoverStaleRuns(deps.db, { maxAttempts: deps.maxAttempts ?? 3 });
  const run = await claimNextRun(deps.db);
  if (!run) return false;
  await executeRun(deps, run);
  return true;
}
```

`deps.notify` with no `to` emails the platform owner: `main.ts` wires it to `sendNotification` with `OWNER_EMAIL` as the fallback recipient (Task 13).

- [ ] **Step 4: Run the tests**

Run: `cd apps/worker && npx vitest run tests/runtime/run-loop.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/runtime/run-loop.ts apps/worker/src/publishers/types.ts apps/worker/tests/runtime/run-loop.test.ts
git commit -m "feat(worker): durable run loop with heartbeat, retries and recovery

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Publish loop and Postiz publisher

**Files:**
- Create: `apps/worker/src/publishers/postiz.ts`, `apps/worker/src/runtime/publish-loop.ts`
- Test: `apps/worker/tests/runtime/publish-loop.test.ts`, `apps/worker/tests/publishers/postiz.test.ts`

**Interfaces:**
- Consumes: `expirePendingPosts`, `claimDuePosts`, `markPublished`, `markFailed`, `BUCKETS`, `Publisher`, `schedulePost` (existing), `ingestAnalytics`.
- Produces:
  - `postizPublisher(): Publisher`
  - `publishTick(deps: { db: Db; storage: StorageClient; publishers: Record<"postiz", Publisher>; notify: (s: string, b: string) => Promise<unknown> }): Promise<{ expired: number; published: number; failed: number }>`
  - `SIGNED_URL_TTL_SEC = 3600`

- [ ] **Step 1: Write the failing tests**

`apps/worker/tests/runtime/publish-loop.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryStorage, insertPost, approvePost, type Db } from "@carepost/core";
import { createTestDb, seedTestBrand } from "@carepost/core/testing";
import { publishTick } from "../../src/runtime/publish-loop.js";

let db: Db;
let storage: MemoryStorage;
let brand: string;
const publish = vi.fn();
const notify = vi.fn().mockResolvedValue("ok");
const deps = () => ({ db, storage, publishers: { postiz: { name: "postiz" as const, publish } }, notify });
const post = (o: any = {}) => insertPost(db, {
  brand_id: brand, kind: "core", status: "approved", planned_at: new Date(Date.now() - 1000),
  caption: "c", hashtags: ["#h"], media: [{ storage_path: `${brand}/p/0.png` }, { storage_path: `${brand}/p/1.png` }],
  prompt_ids: [], rationale: "", ...o,
});
const status = async (id: string) => (await db.query("select status, external_post_id, publish_error from posts where id = $1", [id]))[0];

beforeEach(async () => {
  ({ db } = await createTestDb());
  brand = await seedTestBrand(db, { publisher: "postiz" });
  storage = new MemoryStorage();
  publish.mockReset();
  notify.mockClear();
});

describe("publishTick", () => {
  it("publishes due approved posts with freshly signed 1h URLs", async () => {
    publish.mockResolvedValue({ externalId: "ext-9" });
    const id = await post();
    expect(storage.signedCalls).toHaveLength(0);
    expect(await publishTick(deps())).toEqual({ expired: 0, published: 1, failed: 0 });
    expect(storage.signedCalls.map((c) => c.ttlSec)).toEqual([3600, 3600]);
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      id, caption: "c", hashtags: ["#h"],
      mediaUrls: [`memory://post-media/${brand}/p/0.png?ttl=3600`, `memory://post-media/${brand}/p/1.png?ttl=3600`],
    }));
    expect(await status(id)).toMatchObject({ status: "published", external_post_id: "ext-9" });
  });

  it("expires late drafts and never publishes them, even if approval arrives after", async () => {
    const id = await post({ status: "pending_approval" });
    expect((await publishTick(deps())).expired).toBe(1);
    expect(await approvePost(db, id)).toBe(false);
    await publishTick(deps());
    expect(publish).not.toHaveBeenCalled();
    expect((await status(id)).status).toBe("expired");
  });

  it("marks failures and notifies the owner without retrying", async () => {
    publish.mockRejectedValue(new Error("postiz 500"));
    const id = await post();
    expect(await publishTick(deps())).toEqual({ expired: 0, published: 0, failed: 1 });
    expect(await status(id)).toMatchObject({ status: "failed", publish_error: "postiz 500" });
    expect(notify).toHaveBeenCalledTimes(1);
    await publishTick(deps());
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("leaves future posts and brands without a publisher alone", async () => {
    const future = await post({ planned_at: new Date(Date.now() + 3600_000) });
    const noPub = await seedTestBrand(db, { publisher: null });
    const waiting = await insertPost(db, { brand_id: noPub, kind: "core", status: "approved", planned_at: new Date(Date.now() - 1000),
      caption: "w", hashtags: [], media: [], prompt_ids: [], rationale: "" });
    await publishTick(deps());
    expect(publish).not.toHaveBeenCalled();
    expect((await status(future)).status).toBe("approved");
    expect((await status(waiting)).status).toBe("approved");
  });
});
```

`apps/worker/tests/publishers/postiz.test.ts`:
```ts
import { it, expect, vi } from "vitest";
vi.mock("../../src/tools/schedule-post.js", () => ({ schedulePost: vi.fn() }));
import { schedulePost } from "../../src/tools/schedule-post.js";
import { postizPublisher } from "../../src/publishers/postiz.js";

it("publishes now via Postiz with the signed URLs", async () => {
  (schedulePost as any).mockResolvedValue({ ok: true, message: "ok", postizId: "pz-1" });
  const r = await postizPublisher().publish({ id: "p", brandId: "b", caption: "c", hashtags: ["#h"], mediaUrls: ["https://s/1"] });
  expect(schedulePost).toHaveBeenCalledWith({ caption: "c", hashtags: ["#h"], images: ["https://s/1"] });
  expect(r).toEqual({ externalId: "pz-1" });
});

it("throws when Postiz reports failure", async () => {
  (schedulePost as any).mockResolvedValue({ ok: false, message: "Postiz API key not configured." });
  await expect(postizPublisher().publish({ id: "p", brandId: "b", caption: "c", hashtags: [], mediaUrls: [] }))
    .rejects.toThrow(/not configured/);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/worker && npx vitest run tests/runtime/publish-loop.test.ts tests/publishers`. Expected: FAIL.

- [ ] **Step 3: Implement**

`apps/worker/src/publishers/postiz.ts`:
```ts
import { schedulePost } from "../tools/schedule-post.js";
import { ingestAnalytics } from "../tools/ingest-analytics.js";
import type { Publisher } from "./types.js";

export function postizPublisher(): Publisher {
  return {
    name: "postiz",
    async publish(post) {
      // No scheduledTime → Postiz posts now. The publish loop only hands over posts that are due.
      const r = await schedulePost({ caption: post.caption, hashtags: post.hashtags, images: post.mediaUrls });
      if (!r.ok) throw new Error(r.message);
      return { externalId: r.postizId ?? r.groupId ?? "" };
    },
    async ingestMetrics(brand, db) {
      await ingestAnalytics(brand, db);
    },
  };
}
```

`apps/worker/src/runtime/publish-loop.ts`:
```ts
import { BUCKETS, claimDuePosts, expirePendingPosts, markFailed, markPublished, type Db, type StorageClient } from "@carepost/core";
import type { Publisher } from "../publishers/types.js";

export const SIGNED_URL_TTL_SEC = 3600;

export async function publishTick(deps: {
  db: Db; storage: StorageClient; publishers: Record<"postiz", Publisher>; notify: (s: string, b: string) => Promise<unknown>;
}): Promise<{ expired: number; published: number; failed: number }> {
  const expired = await expirePendingPosts(deps.db);
  let published = 0;
  let failed = 0;
  for (const post of await claimDuePosts(deps.db, 5)) {
    try {
      // Sign at publish time so the URLs are valid while the platform fetches them.
      const mediaUrls = await Promise.all(post.media.map((m) => deps.storage.signedUrl(BUCKETS.media, m.storage_path, SIGNED_URL_TTL_SEC)));
      const { externalId } = await deps.publishers[post.publisher].publish({
        id: post.id, brandId: post.brand_id, caption: post.caption, hashtags: post.hashtags, mediaUrls,
      });
      await markPublished(deps.db, post.id, externalId);
      published++;
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await markFailed(deps.db, post.id, error);
      await deps.notify(`Publish failed for post ${post.id}`, `Brand ${post.brand_id}, planned ${post.planned_at.toISOString()}:\n${error}`);
      failed++;
    }
  }
  return { expired, published, failed };
}
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/worker && npx vitest run`. Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/publishers apps/worker/src/runtime/publish-loop.ts apps/worker/tests
git commit -m "feat(worker): publish loop with expiry and Postiz publisher

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Worker entrypoint, CLI, Chromium and Docker

**Files:**
- Create: `apps/worker/src/main.ts`, `apps/worker/src/cli.ts`, `apps/worker/src/lib/browser.ts`, `apps/worker/src/runtime/deps.ts`, `Dockerfile`, `.dockerignore`
- Modify: `apps/worker/src/tools/{photo-overlay,react-slide,carousel-cover}.ts`, `apps/worker/src/lib/gradient.ts` (use `launchBrowser`); `apps/worker/package.json` (`start`)
- Delete: `apps/worker/src/index.ts`, `apps/worker/src/utils/detect-tunnel.ts`
- Test: `apps/worker/tests/lib/browser.test.ts`, `apps/worker/tests/runtime/deps.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 4–12.
- Produces:
  - `launchBrowser(opts?: LaunchOptions)` and `sandboxArgs(env?: NodeJS.ProcessEnv): string[]`
  - `buildDeps(env: NodeJS.ProcessEnv): { db; storage; runDeps: RunDeps; publishDeps }`
  - `readWorkerEnv(env): WorkerEnv` (validated with zod; throws listing missing vars)
  - CLI `npm run agent -- --brand <slug> --kind weekly_plan|daily_check|manual [--period <key>] [--brief "<text>"]`

- [ ] **Step 1: Write the failing tests**

`apps/worker/tests/lib/browser.test.ts`:
```ts
import { it, expect } from "vitest";
import { sandboxArgs } from "../../src/lib/browser.js";
it("adds no-sandbox flags only when PUPPETEER_NO_SANDBOX=1", () => {
  expect(sandboxArgs({})).toEqual([]);
  expect(sandboxArgs({ PUPPETEER_NO_SANDBOX: "1" })).toEqual(["--no-sandbox", "--disable-setuid-sandbox"]);
});
```

`apps/worker/tests/runtime/deps.test.ts`:
```ts
import { it, expect } from "vitest";
import { readWorkerEnv } from "../../src/runtime/deps.js";
it("lists every missing required env var", () => {
  expect(() => readWorkerEnv({})).toThrow(/DATABASE_URL.*SUPABASE_URL.*SUPABASE_SERVICE_ROLE_KEY.*ANTHROPIC_API_KEY/s);
});
it("applies defaults", () => {
  const env = readWorkerEnv({ DATABASE_URL: "postgres://x", SUPABASE_URL: "https://s", SUPABASE_SERVICE_ROLE_KEY: "k", ANTHROPIC_API_KEY: "a" });
  expect(env).toMatchObject({ WORKER_CONCURRENCY: 2, TMP_ROOT: "tmp/runs" });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/worker && npx vitest run tests/lib tests/runtime/deps.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement `browser.ts` and switch the 4 launch sites**

```ts
import puppeteer, { type LaunchOptions } from "puppeteer";

export function sandboxArgs(env: NodeJS.ProcessEnv = process.env): string[] {
  return env.PUPPETEER_NO_SANDBOX === "1" ? ["--no-sandbox", "--disable-setuid-sandbox"] : [];
}

export function launchBrowser(opts: LaunchOptions = {}) {
  return puppeteer.launch({ ...opts, args: [...(opts.args ?? []), ...sandboxArgs()] });
}
```

In `src/tools/photo-overlay.ts:270`, `src/tools/react-slide.ts:108`, `src/tools/carousel-cover.ts:354` and `src/lib/gradient.ts:234`, replace `puppeteer.launch(` with `launchBrowser(`, add `import { launchBrowser } from "../lib/browser.js";` (from `gradient.ts` the path is `./browser.js`), and remove the `puppeteer` default import if it becomes unused.

- [ ] **Step 4: Implement `deps.ts`, `main.ts` and `cli.ts`**

`apps/worker/src/runtime/deps.ts`:
```ts
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
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  TMP_ROOT: z.string().default("tmp/runs"),
});
export type WorkerEnv = z.infer<typeof EnvSchema>;

export function readWorkerEnv(env: NodeJS.ProcessEnv): WorkerEnv {
  const r = EnvSchema.safeParse(env);
  if (!r.success) {
    const missing = r.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Missing/invalid worker env: ${missing}`);
  }
  return r.data;
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
```

`apps/worker/src/main.ts`:
```ts
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
```

`apps/worker/src/cli.ts`:
```ts
import "dotenv/config";
import { parseArgs } from "node:util";
import { claimRunById, enqueueRun, getBrandBySlug, isoWeekKey, localParts, addDaysYmd, type RunKind } from "@carepost/core";
import { buildDeps } from "./runtime/deps.js";
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
const agent = runDeps.agent;
await executeRun({ ...runDeps, agent: (b, d, o) => agent(b, d, { ...o, userBrief: values.brief }) }, run!);
const [row] = await db.query("select status, summary, error from agent_runs where id = $1", [id]);
console.log(row);
await db.end();
```

Then:
```bash
git rm apps/worker/src/index.ts apps/worker/src/utils/detect-tunnel.ts
```

Set `"start": "tsx src/main.ts"` in `apps/worker/package.json`, and remove `node-cron` and `@types/node-cron` (the scheduler replaces them). Check with `grep -rn "node-cron" apps/worker/src apps/worker/scripts/lib`; expect no results. Run `grep -rn "detect-tunnel" apps/worker/src`; expect no results (`schedule-post.ts` reads `POSTIZ_TUNNEL_URL` from env only).

- [ ] **Step 5: Dockerfile and `.dockerignore`**

`Dockerfile`:
```dockerfile
FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_NO_SANDBOX=1
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium fonts-liberation fonts-noto-color-emoji fonts-noto-cjk ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
RUN npm ci --omit=dev -w @carepost/worker -w @carepost/core
COPY packages/core packages/core
COPY apps/worker apps/worker
COPY supabase supabase
WORKDIR /app/apps/worker
CMD ["npx", "tsx", "src/main.ts"]
```

`.dockerignore`:
```
**/node_modules
**/tmp
**/*.db*
apps/web/.next
.git
.env
```

(Before Task 15 creates `apps/web/package.json`, the `COPY apps/web/package.json` line would fail. Create a placeholder `apps/web/package.json` with `{"name":"@carepost/web","private":true,"version":"0.0.0"}` in this task; Task 15 replaces it.)

- [ ] **Step 6: Run the tests and build the image**

Run: `cd apps/worker && npx vitest run && cd ../.. && docker build -t carepost-worker .`
Expected: tests PASS; the image builds. Then run `docker run --rm carepost-worker npx tsx -e "import('./src/lib/browser.js').then(async m => { const b = await m.launchBrowser(); console.log(await b.version()); await b.close(); })"`, which should print a `Chrome/…` version. If Docker is not available locally, record that in the commit message, and verify the image build on Railway in Task 16.

- [ ] **Step 7: Commit**

```bash
git add -A apps/worker Dockerfile .dockerignore
git commit -m "feat(worker): long-running entrypoint, CLI, Chromium container

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Seed and SQLite migration scripts

**Files:**
- Create: `apps/worker/scripts/lib/seed-brand.ts`, `apps/worker/scripts/seed-brand.ts`, `apps/worker/scripts/lib/migrate-sqlite.ts`, `apps/worker/scripts/migrate-sqlite.ts`
- Create fixtures: `apps/worker/tests/fixtures/seed-brand/demo/{brand.json,hot-topics-sources.json,assets/logo.png,assets/products/rosehip-serum.jpg}`
- Test: `apps/worker/tests/scripts/seed-brand.test.ts`, `apps/worker/tests/scripts/migrate-sqlite.test.ts`

**Interfaces:**
- Consumes: `loadBrand`, `brandSourcesPath` (Task 5), `loadSourcesConfig` (Task 7), `createLegacySqlite` from `scripts/legacy/sqlite-schema.ts` (the moved `createDatabase`; rename the export in this task), `BUCKETS`, `insertPost`, `insertAnalytics`, `upsertTrend`, `insertCompetitorSnapshot`.
- Produces:
  - `seedBrandFromDir(deps: { db: Db; storage: StorageClient }, brandDir: string, ownerEmail: string): Promise<string>` (brand uuid; idempotent by slug)
  - `migrateSqlite(sqlite: Database.Database, db: Db, brandId: string): Promise<{ posts: number; metrics: number; trends: number; competitors: number }>`

- [ ] **Step 1: Create the fixtures**

`apps/worker/tests/fixtures/seed-brand/demo/brand.json`:
```json
{
  "id": "demo", "name": "Demo Skin", "domain": "demo.be", "niche": "skincare", "description": "Gentle plant-based skincare.",
  "competitors": [], "keywords": ["skincare"], "tone": "Calm and warm",
  "postingSchedule": { "coreDays": ["mon","tue","wed","thu","fri"], "defaultTime": "10:00" },
  "instagramHandle": "demoskin",
  "branding": { "enabled": true, "logoPath": "assets/logo.png" },
  "hotTopics": { "relevantThemes": "skincare" }
}
```
`hot-topics-sources.json`: `{ "sources": [ { "id": "r-skincare", "name": "r/SkincareAddiction", "type": "reddit", "category": "skincare", "url": "https://www.reddit.com/r/SkincareAddiction/top.json?t=day" } ] }`. Match the `HotTopicSource` shape in `scrape-hot-topics.ts`; adjust field names if they differ.
Create the image files with `printf 'L' > assets/logo.png; printf 'S' > assets/products/rosehip-serum.jpg`.

- [ ] **Step 2: Write the failing tests**

`apps/worker/tests/scripts/seed-brand.test.ts`:
```ts
import { it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryStorage } from "@carepost/core";
import { createTestDb } from "@carepost/core/testing";
import { seedBrandFromDir } from "../../scripts/lib/seed-brand.js";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/seed-brand/demo");

it("seeds brand, assets, sources and owner idempotently", async () => {
  const { db } = await createTestDb();
  await db.query("insert into auth.users (id, email) values (gen_random_uuid(), 'Owner@Demo.be')");
  const storage = new MemoryStorage();
  const id = await seedBrandFromDir({ db, storage }, DIR, "owner@demo.be");
  const again = await seedBrandFromDir({ db, storage }, DIR, "owner@demo.be");
  expect(again).toBe(id);

  const [b] = await db.query("select slug, timezone, approval_mode, branding from brands where id = $1", [id]);
  expect(b).toMatchObject({ slug: "demo", timezone: "Europe/Brussels", approval_mode: "review" });
  expect(b.branding.logoPath).toBe("assets/logo.png");
  const assets = await db.query("select kind, storage_path, label from brand_assets where brand_id = $1 order by kind", [id]);
  expect(assets).toEqual([
    { kind: "logo", storage_path: `${id}/logo/logo.png`, label: null },
    { kind: "product", storage_path: `${id}/product/rosehip-serum.jpg`, label: "rosehip serum" },
  ]);
  expect(storage.files.has(`brand-assets/${id}/product/rosehip-serum.jpg`)).toBe(true);
  expect(await db.query("select 1 from brand_sources where brand_id = $1", [id])).toHaveLength(1);
  expect(await db.query("select role from brand_members where brand_id = $1", [id])).toEqual([{ role: "owner" }]);
});

it("asks the owner to sign in first when the email is unknown", async () => {
  const { db } = await createTestDb();
  await expect(seedBrandFromDir({ db, storage: new MemoryStorage() }, DIR, "nobody@demo.be")).rejects.toThrow(/sign in to the web app/i);
});
```

`apps/worker/tests/scripts/migrate-sqlite.test.ts`:
```ts
import { it, expect } from "vitest";
import { createTestDb, seedTestBrand } from "@carepost/core/testing";
import { createLegacySqlite } from "../../scripts/legacy/sqlite-schema.js";
import { migrateSqlite } from "../../scripts/lib/migrate-sqlite.js";

it("imports legacy posts, analytics, trends and competitors", async () => {
  const sqlite = createLegacySqlite(":memory:");
  sqlite.prepare(`insert into posts (brand_id, caption, hashtags, image_url, posted_at, external_post_id, source_images, is_outlier, notes)
    values ('carephoto', 'Old post', '["#a"]', 'https://img/1.png', '2026-04-01T10:00:00Z', 'pz-1', '["p1"]', 1, 'boosted')`).run();
  sqlite.prepare(`insert into analytics (post_id, brand_id, likes, reach) values (1, 'carephoto', 12, 300)`).run();
  sqlite.prepare(`insert into trends (source_id, category, title, url, score) values ('hn','tech','T','https://t/1', 5)`).run();
  sqlite.prepare(`insert into competitor_snapshots (brand_id, competitor_name, content_summary) values ('carephoto','Remini','s')`).run();

  const { db } = await createTestDb();
  const brandId = await seedTestBrand(db, { slug: "carephoto" });
  expect(await migrateSqlite(sqlite, db, brandId)).toEqual({ posts: 1, metrics: 1, trends: 1, competitors: 1 });
  const [p] = await db.query("select status, kind, caption, prompt_ids, external_post_id, is_outlier, notes from posts");
  expect(p).toMatchObject({ status: "published", kind: "core", caption: "Old post", prompt_ids: ["p1"], external_post_id: "pz-1", is_outlier: true });
  expect(p.notes).toContain("https://img/1.png");
  expect(await migrateSqlite(sqlite, db, brandId)).toEqual({ posts: 0, metrics: 0, trends: 0, competitors: 0 }); // idempotent
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd apps/worker && npx vitest run tests/scripts`. Expected: FAIL.

- [ ] **Step 4: Implement**

In `apps/worker/scripts/legacy/sqlite-schema.ts`, rename the exported `createDatabase` to `createLegacySqlite` (no other change).

`apps/worker/scripts/lib/seed-brand.ts`:
```ts
import fs from "node:fs";
import path from "node:path";
import { BUCKETS, type Db, type StorageClient } from "@carepost/core";
import { loadBrand, brandSourcesPath } from "../../src/config/load-brand.js";
import { loadSourcesConfig } from "../../src/tools/scrape-hot-topics.js";

const TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".otf": "font/otf" };
const typeOf = (f: string) => TYPES[path.extname(f).toLowerCase()] ?? "application/octet-stream";

export async function seedBrandFromDir(deps: { db: Db; storage: StorageClient }, brandDir: string, ownerEmail: string): Promise<string> {
  const { db, storage } = deps;
  const file = loadBrand(path.basename(brandDir), path.dirname(brandDir));
  const [owner] = await db.query<{ id: string }>("select id from auth.users where lower(email) = lower($1)", [ownerEmail]);
  if (!owner) throw new Error(`No user ${ownerEmail}. Sign in to the web app once with that email, then re-run.`);

  const branding = file.branding ? { ...file.branding } : null;
  const assetFiles: { kind: "logo" | "font" | "icon" | "product"; src: string; label: string | null }[] = [];
  if (branding) {
    const fields = [["logoPath", "logo"], ["fontPath", "font"], ["instagramIconPath", "icon"]] as const;
    for (const [field, kind] of fields) {
      const rel = branding[field];
      if (!rel) continue;
      assetFiles.push({ kind, src: path.resolve(brandDir, rel), label: null });
      (branding as any)[field] = `assets/${path.basename(rel)}`;
    }
  }
  const productsDir = path.join(brandDir, "assets/products");
  if (fs.existsSync(productsDir)) {
    for (const f of fs.readdirSync(productsDir).filter((f) => typeOf(f).startsWith("image/")).sort()) {
      assetFiles.push({ kind: "product", src: path.join(productsDir, f), label: path.parse(f).name.replace(/[-_]+/g, " ") });
    }
  }

  const [brand] = await db.query<{ id: string }>(
    `insert into brands (slug, name, domain, niche, description, tone, keywords, competitors, instagram_handle, design_system,
       prompt_bank_path, branding, carousel, hot_topics, image_generation, posting_schedule, timezone, approval_mode, publisher)
     values ($1,$2,$3,$4,$5,$6,$7::text[],$8::jsonb,$9,$10,$11,$12::jsonb,$13::jsonb,$14::jsonb,$15::jsonb,$16::jsonb,$17,$18,$19)
     on conflict (slug) do update set name = excluded.name, domain = excluded.domain, niche = excluded.niche,
       description = excluded.description, tone = excluded.tone, keywords = excluded.keywords, competitors = excluded.competitors,
       instagram_handle = excluded.instagram_handle, design_system = excluded.design_system, prompt_bank_path = excluded.prompt_bank_path,
       branding = excluded.branding, carousel = excluded.carousel, hot_topics = excluded.hot_topics,
       image_generation = excluded.image_generation, posting_schedule = excluded.posting_schedule, timezone = excluded.timezone,
       approval_mode = excluded.approval_mode, publisher = excluded.publisher
     returning id`,
    [file.id, file.name, file.domain, file.niche, file.description, file.tone, file.keywords, JSON.stringify(file.competitors),
     file.instagramHandle ?? null, file.designSystem ?? null, file.promptBankPath ?? null, JSON.stringify(branding),
     JSON.stringify(file.carousel ?? null), JSON.stringify(file.hotTopics ?? null), JSON.stringify(file.imageGeneration ?? null),
     JSON.stringify(file.postingSchedule), file.timezone, file.approvalMode, file.publisher]);

  for (const a of assetFiles) {
    const storagePath = `${brand.id}/${a.kind}/${path.basename(a.src)}`;
    await storage.upload(BUCKETS.assets, storagePath, fs.readFileSync(a.src), typeOf(a.src));
    await db.query(
      `insert into brand_assets (brand_id, kind, storage_path, label) values ($1,$2,$3,$4)
       on conflict (storage_path) do update set label = excluded.label`, [brand.id, a.kind, storagePath, a.label]);
  }

  const sourcesFile = brandSourcesPath(file);
  if (fs.existsSync(sourcesFile)) {
    await db.query("delete from brand_sources where brand_id = $1", [brand.id]);
    for (const s of loadSourcesConfig(sourcesFile).sources) {
      await db.query("insert into brand_sources (brand_id, source) values ($1, $2::jsonb)", [brand.id, JSON.stringify(s)]);
    }
  }

  await db.query(
    "insert into brand_members (brand_id, user_id, role) values ($1, $2, 'owner') on conflict do nothing", [brand.id, owner.id]);
  return brand.id;
}
```

`apps/worker/scripts/seed-brand.ts`:
```ts
import "dotenv/config";
import path from "node:path";
import { createPostgresDb, createSupabaseStorage } from "@carepost/core";
import { seedBrandFromDir } from "./lib/seed-brand.js";

const [dir, email] = process.argv.slice(2);
if (!dir || !email) { console.error("Usage: npm run seed-brand -- <brands/slug> <owner-email>"); process.exit(1); }
const db = createPostgresDb(process.env.DATABASE_URL!);
const storage = createSupabaseStorage(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
console.log("seeded brand", await seedBrandFromDir({ db, storage }, path.resolve(dir), email));
await db.end();
```

`apps/worker/scripts/lib/migrate-sqlite.ts`:
```ts
import type Database from "better-sqlite3";
import { insertAnalytics, insertCompetitorSnapshot, insertPost, upsertTrend, type Db } from "@carepost/core";

export async function migrateSqlite(sqlite: Database.Database, db: Db, brandId: string) {
  const counts = { posts: 0, metrics: 0, trends: 0, competitors: 0 };
  const idMap = new Map<number, string>();
  const posts = sqlite.prepare("select * from posts order by id").all() as any[];
  for (const p of posts) {
    const marker = `legacy-sqlite:${p.id}`;
    const existing = await db.query<{ id: string }>("select id from posts where brand_id = $1 and notes like $2", [brandId, `${marker}%`]);
    if (existing[0]) { idMap.set(p.id, existing[0].id); continue; }
    const at = new Date(p.posted_at ?? p.created_at.replace(" ", "T") + "Z");
    const id = await insertPost(db, {
      brand_id: brandId, kind: "core", status: "published", planned_at: at, published_at: at, caption: p.caption,
      hashtags: JSON.parse(p.hashtags ?? "[]"), media: [], prompt_ids: JSON.parse(p.source_images ?? "[]"), rationale: "",
      external_post_id: p.external_post_id, notes: `${marker} ${p.image_url ?? ""} ${p.notes ?? ""}`.trim(),
    });
    if (p.is_outlier) await db.query("update posts set is_outlier = true where id = $1", [id]);
    idMap.set(p.id, id);
    counts.posts++;
  }
  // Metrics, trends and competitors only migrate on the first run (posts newly inserted above).
  if (counts.posts === 0) return counts;
  for (const a of sqlite.prepare("select * from analytics").all() as any[]) {
    const postId = idMap.get(a.post_id);
    if (!postId) continue;
    await insertAnalytics(db, { post_id: postId, brand_id: brandId, likes: a.likes ?? 0, comments: a.comments ?? 0, shares: a.shares ?? 0,
      reach: a.reach ?? 0, impressions: a.impressions ?? 0, views: a.views ?? 0, saves: a.saves ?? 0,
      profile_visits: a.profile_visits ?? 0, link_clicks: a.link_clicks ?? 0 });
    counts.metrics++;
  }
  for (const t of sqlite.prepare("select * from trends").all() as any[]) {
    await upsertTrend(db, brandId, { source_id: t.source_id, category: t.category, title: t.title, url: t.url,
      summary: t.summary, published_at: t.published_at, score: t.score });
    counts.trends++;
  }
  for (const c of sqlite.prepare("select * from competitor_snapshots").all() as any[]) {
    await insertCompetitorSnapshot(db, { brand_id: brandId, competitor_name: c.competitor_name,
      content_summary: c.content_summary ?? "", engagement_notes: c.engagement_notes ?? "" });
    counts.competitors++;
  }
  return counts;
}
```

`apps/worker/scripts/migrate-sqlite.ts`:
```ts
import "dotenv/config";
import Database from "better-sqlite3";
import { createPostgresDb, getBrandBySlug } from "@carepost/core";
import { migrateSqlite } from "./lib/migrate-sqlite.js";

const [file = "marketing-agent.db", slug = "carephoto"] = process.argv.slice(2);
const db = createPostgresDb(process.env.DATABASE_URL!);
const brand = await getBrandBySlug(db, slug);
if (!brand) throw new Error(`Seed brand ${slug} first (npm run seed-brand).`);
console.log(await migrateSqlite(new Database(file, { readonly: true }), db, brand.id));
await db.end();
```

- [ ] **Step 5: Run the tests**

Run: `cd apps/worker && npx vitest run tests/scripts && npx tsc --noEmit -p . 2>&1 | grep -c "error TS"`
Expected: PASS; error count ≤ baseline.

- [ ] **Step 6: Commit**

```bash
git add -A apps/worker/scripts apps/worker/tests
git commit -m "feat(worker): seed-brand and one-off SQLite import scripts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Minimal web app (auth + read-only drafts)

**Files:**
- Create: `apps/web/package.json` (replaces placeholder), `apps/web/next.config.ts`, `apps/web/tsconfig.json`, `apps/web/vitest.config.ts`, `apps/web/middleware.ts`, `apps/web/lib/supabase/server.ts`, `apps/web/lib/format.ts`, `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`, `apps/web/app/login/page.tsx`, `apps/web/app/auth/callback/route.ts`, `apps/web/app/brands/[slug]/page.tsx`, `apps/web/.env.example`
- Test: `apps/web/lib/format.test.ts`

**Interfaces:**
- Consumes: the DB schema from Task 4 (through Supabase REST with the user's session, so RLS applies) and the `post-media` storage policy.
- Produces:
  - `formatPlanned(iso: string, tz: string): string`
  - `statusLabel(s: string): string`
  - Routes: `/login`, `/auth/callback`, `/`, `/brands/[slug]`

- [ ] **Step 1: Package and config**

`apps/web/package.json`:
```json
{
  "name": "@carepost/web",
  "version": "0.1.0",
  "private": true,
  "scripts": { "dev": "next dev", "build": "next build", "start": "next start", "test": "vitest run", "typecheck": "tsc --noEmit -p ." },
  "dependencies": {
    "next": "15.2.4", "react": "19.0.0", "react-dom": "19.0.0",
    "@supabase/ssr": "0.5.2", "@supabase/supabase-js": "2.49.4"
  },
  "devDependencies": { "typescript": "5.9.3", "@types/react": "19.0.10", "@types/node": "^22.10.0", "vitest": "3.2.4" }
}
```
`apps/web/next.config.ts`: `import type { NextConfig } from "next"; const config: NextConfig = {}; export default config;`
`apps/web/tsconfig.json`: the standard Next.js App Router tsconfig (`"jsx": "preserve"`, `"moduleResolution": "bundler"`, `"plugins": [{ "name": "next" }]`, `"paths": { "@/*": ["./*"] }`, `"strict": true`, `"noEmit": true`, include `next-env.d.ts`, `**/*.ts`, `**/*.tsx`).
`apps/web/vitest.config.ts`: `import { defineConfig } from "vitest/config"; export default defineConfig({ test: { environment: "node" } });`
`apps/web/.env.example`: `NEXT_PUBLIC_SUPABASE_URL=` and `NEXT_PUBLIC_SUPABASE_ANON_KEY=`.

- [ ] **Step 2: Write the failing test** (`apps/web/lib/format.test.ts`)

```ts
import { it, expect } from "vitest";
import { formatPlanned, statusLabel } from "./format";
it("formats planned time in the brand timezone", () => {
  expect(formatPlanned("2026-10-19T08:00:00Z", "Europe/Brussels")).toBe("Mon 19 Oct, 10:00");
});
it("labels statuses for non-technical readers", () => {
  expect(statusLabel("pending_approval")).toBe("Needs your OK");
  expect(statusLabel("expired")).toBe("Expired (not approved in time)");
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm install && cd apps/web && npx vitest run`. Expected: FAIL.

- [ ] **Step 4: Implement the library and routes**

`apps/web/lib/format.ts`:
```ts
export function formatPlanned(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(new Date(iso)).replace(/^(\w+) (\d+) (\w+), /, "$1 $2 $3, ");
}
const LABELS: Record<string, string> = {
  pending_approval: "Needs your OK", approved: "Scheduled", publishing: "Posting…", published: "Posted",
  failed: "Failed", rejected: "Skipped", expired: "Expired (not approved in time)",
};
export const statusLabel = (s: string) => LABELS[s] ?? s;
```
(If the `en-GB` output differs in punctuation on the installed ICU, adjust the regex so the test's exact string `Mon 19 Oct, 10:00` passes. The test is the contract.)

`apps/web/lib/supabase/server.ts`:
```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* server component: middleware refreshes */ }
      },
    },
  });
}
```

`apps/web/middleware.ts`:
```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  const open = request.nextUrl.pathname.startsWith("/login") || request.nextUrl.pathname.startsWith("/auth");
  if (!user && !open) return NextResponse.redirect(new URL("/login", request.url));
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
```

`apps/web/app/layout.tsx`:
```tsx
export const metadata = { title: "Carepost" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: 960, margin: "0 auto", padding: 16 }}>{children}</body>
    </html>
  );
}
```

`apps/web/app/login/page.tsx`:
```tsx
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

async function sendLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${origin}/auth/callback` } });
}

export default function Login() {
  return (
    <main>
      <h1>Sign in to Carepost</h1>
      <p>We'll email you a sign-in link.</p>
      <form action={sendLink}>
        <input name="email" type="email" required placeholder="you@brand.com" />
        <button type="submit">Email me a link</button>
      </form>
    </main>
  );
}
```

`apps/web/app/auth/callback/route.ts`:
```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) await (await createClient()).auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL("/", url.origin));
}
```

`apps/web/app/page.tsx`:
```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data: brands } = await supabase.from("brands").select("slug, name").order("name");
  return (
    <main>
      <h1>Your brands</h1>
      {!brands?.length ? <p>You don't have access to any brand yet.</p> : (
        <ul>{brands.map((b) => <li key={b.slug}><Link href={`/brands/${b.slug}`}>{b.name}</Link></li>)}</ul>
      )}
    </main>
  );
}
```

`apps/web/app/brands/[slug]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPlanned, statusLabel } from "@/lib/format";

export default async function BrandPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: brand } = await supabase.from("brands").select("id, name, timezone").eq("slug", slug).maybeSingle();
  if (!brand) notFound();
  const { data: posts } = await supabase.from("posts")
    .select("id, kind, status, planned_at, caption, media").eq("brand_id", brand.id)
    .order("planned_at", { ascending: false }).limit(100);
  const firstPaths = (posts ?? []).map((p) => (p.media as { storage_path: string }[])[0]?.storage_path).filter(Boolean) as string[];
  const { data: signed } = firstPaths.length
    ? await supabase.storage.from("post-media").createSignedUrls(firstPaths, 600)
    : { data: [] as { path: string | null; signedUrl: string }[] };
  const thumb = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return (
    <main>
      <h1>{brand.name}</h1>
      <table cellPadding={6}>
        <thead><tr><th></th><th>When</th><th>Type</th><th>Status</th><th>Caption</th></tr></thead>
        <tbody>
          {(posts ?? []).map((p) => {
            const path = (p.media as { storage_path: string }[])[0]?.storage_path;
            const src = path ? thumb.get(path) : undefined;
            return (
              <tr key={p.id}>
                <td>{src ? <img src={src} alt="" width={64} height={80} style={{ objectFit: "cover" }} /> : null}</td>
                <td>{formatPlanned(p.planned_at, brand.timezone)}</td>
                <td>{p.kind === "timely" ? "Timely" : "Planned"}</td>
                <td>{statusLabel(p.status)}</td>
                <td>{p.caption.split("\n")[0].slice(0, 120)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 5: Run the tests and build**

Run: `cd apps/web && npx vitest run && NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x npx next build`
Expected: tests PASS; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/web package-lock.json
git commit -m "feat(web): magic-link login and read-only brand drafts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Runbook and end-to-end smoke (owner steps)

**Files:**
- Create: `docs/runbooks/carepost-foundation.md` (the checklist below, copied verbatim and ticked off during rollout)
- Modify: `apps/worker/.env.example` (worker env: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `OWNER_EMAIL`, `WORKER_CONCURRENCY`, `TMP_ROOT`, plus the existing Postiz/SMTP/Firecrawl/CAREPHOTO vars)

**Interfaces:** none (operational).

- [ ] **Step 1: Write `docs/runbooks/carepost-foundation.md`**

```markdown
# Carepost foundation rollout

## 1. Supabase (owner)
- [ ] Create a Supabase project "carepost" in an EU region (Frankfurt).
- [ ] `npx supabase link --project-ref <ref>` then `npx supabase db push` (applies supabase/migrations/*).
- [ ] Verify the storage buckets `brand-assets` and `post-media` exist and are private.
- [ ] Auth → URL configuration: set Site URL to the web app URL; add `<web-url>/auth/callback` to the redirect URLs.
- [ ] Copy the pooled connection string (session mode, port 5432) as DATABASE_URL, the project URL, and the service-role key.

## 2. Web (owner)
- [ ] Vercel → New Project → this repo, Root Directory `apps/web`.
- [ ] Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY. Deploy.
- [ ] Sign in once with your email (this creates your auth user).

## 3. Seed carephoto (owner's laptop, apps/worker/.env pointing at Supabase)
- [ ] `cd apps/worker && npm run seed-brand -- brands/carephoto okar.mert@gmail.com`
- [ ] `npm run migrate-sqlite -- marketing-agent.db carephoto` (prints counts; re-running prints zeros)
- [ ] The web app shows carephoto with its imported history.

## 4. Worker (owner)
- [ ] Railway → New Service → this repo, Dockerfile at the root.
- [ ] Env: DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, OWNER_EMAIL, POSTIZ_API_KEY, POSTIZ_BASE_URL, CAREPHOTO_API_KEY, CAREPHOTO_BASE_URL, FIRECRAWL_API_KEY, SMTP_* (copy the values from the current local .env; do not set POSTIZ_TUNNEL_URL).
- [ ] Deploy; logs show `[worker] started (concurrency 2)`.

## 5. Smoke test
- [ ] `npm run agent -- --brand carephoto --kind manual --brief "Draft one test post for tomorrow; do not use prompt-bank images."` (locally against prod DB, or via `railway run`).
- [ ] The run prints `status: 'succeeded'`; the web app shows the draft with a thumbnail; the storage policy lets you see the image.
- [ ] carephoto is `autopilot` + `publisher='postiz'`: at planned time the worker log shows `[publish] { published: 1 }` and the post appears on Instagram.
- [ ] Reject the test post if needed: `update posts set status='rejected' where id='<id>'`.

## 6. Cut over
- [ ] After 7 consecutive days of correct carephoto posts from the worker, unload the laptop job: `launchctl unload ~/Library/LaunchAgents/com.carephoto.hot-topics.plist` and stop any local `npm start`.
```

- [ ] **Step 2: Update `apps/worker/.env.example`** with the variables listed under Files (empty values, one comment line each).

- [ ] **Step 3: Run the full suite one last time**

Run: `npm test && npm run typecheck 2>&1 | tail -5`
Expected: all workspaces' tests PASS; core and web typecheck clean; worker error count ≤ baseline.

- [ ] **Step 4: Commit**

```bash
git add docs/runbooks apps/worker/.env.example
git commit -m "docs: Carepost foundation rollout runbook

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review notes (spec coverage)

| Spec item | Task |
|---|---|
| G1 brands in Postgres, no brand.json on prod path | 4, 5, 6, 13 |
| G2 always-on worker, weekly + daily schedule | 10, 11, 13 |
| G3 drafts + media in Storage, review/autopilot status | 9 |
| G4 Publisher interface, Postiz keeps carephoto posting | 11 (interface), 12 |
| G5 sign-in + read-only drafts | 4 (RLS), 15 |
| G6 migrate SQLite history | 14 |
| Data model + RLS + storage buckets | 4 |
| Queue claim, heartbeat, 3 attempts, recovery | 4, 11 |
| `save_post` window + status + timely notification | 8, 9 |
| `get_planned_posts` | 9 |
| Expiry | 4, 12 |
| Product photos (as-is until referenceImages) | 5, 6, 9 |
| Seed carephoto only; Kuanyin/Cortera self-onboard later | 14, 16 |
| Defaults Europe/Brussels, Mon–Fri 10:00 | 4 (column defaults), 5 (schema defaults) |
| Railway Dockerfile | 13 |
| Error-handling table | 9 (upload), 11 (agent/scrape/crash), 12 (publisher/expiry), 10 (dup tick) |

**Deviations from the spec:**
1. RLS is tested in PGlite with a Supabase-like shim, not `supabase start` (no Docker needed). Storage policies are only checked in the Task 16 smoke test.
2. The `Publisher` interface uses `ingestMetrics(brand, db)` instead of `fetchMetrics(posts)`, so the existing Postiz ingestion code is reused unchanged.
3. Added `brands.prompt_bank_path`, which the spec's column list omits but the agent needs.
4. Extra guards beyond the spec: one core post per local date, and core/timely kind enforced per run kind. These cover Review Focus #2.
5. Legacy one-off scripts in `apps/worker/scripts/` are no longer type-checked; those depending on SQLite or `schedule_post` stop working (listed in the Task 7 commit).
