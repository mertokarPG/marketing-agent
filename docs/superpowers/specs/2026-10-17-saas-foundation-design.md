# Carepost SaaS: Sub-project 1, Foundation (Design Spec)

**Date:** 2026-10-17
**Status:** Draft, awaiting review
**Product:** Carepost (working name), a social media manager for brands, "by carephoto"

## Context

marketing-agent today is a single-brand Node CLI: `brands/<id>/brand.json` on disk, a local
SQLite DB, `node-cron` at 07:00, and Puppeteer/sharp rendering into `tmp/`. Postiz publishes,
with images re-hosted through a tunnel, catbox or tmpfiles.

The product goal is a paid, self-serve web SaaS for non-technical brand managers. The launch
customers are **Kuanyin Skin** (skincare) and **corterafashion** (fashion). The owner onboards
them concierge-style and then hands each brand to its own brand manager.

The work is split into five sub-projects, each with its own spec, plan and implementation:

1. **Foundation (this spec):** multi-tenant data, a worker that runs the agent per brand,
   drafts stored in the cloud.
2. Instagram publishing via the Meta "Instagram API with Instagram Login" (direct, no Postiz)
   behind the Publisher interface defined here.
3. Dashboard: home screen (summary + week calendar), full calendar, review, edit and approve,
   and the review/autopilot toggle UI.
4. Onboarding: website + IG handle + product photos → auto-derived brand profile; invites and
   hand-off.
5. Billing: Stripe subscriptions, per-brand post quotas, usage caps.

Kuanyin and Cortera go live after 1–3, with onboarding done by hand. Billing ships when there
is someone to charge.

### Decisions already made (not revisited here)

| Topic | Decision |
|---|---|
| Product shape | Separate product on its own domain, endorsed by carephoto |
| Approval | Per-brand `approval_mode`: `review` (default) or `autopilot` |
| Pricing | Hosted keys, flat monthly subscription per brand (sub-project 5) |
| Images | carephoto Agent API, including `referenceImages` for product photos (shipping separately in the lula repo) |
| Product photos | Used as-is AND as reference images for AI lifestyle scenes |
| Accounts | Many-to-many users↔brands; the owner onboards, then hands off |
| Publishing | Meta direct, Instagram only for v1, behind a pluggable Publisher |
| Drafting cadence | Weekly plan of core posts + a daily check that may add a "timely" post |
| Repo structure | One repo, `apps/web` + `apps/worker` + `packages/core` |
| Auth / DB / storage | Supabase (Auth, Postgres with RLS, Storage) |

## Goals

- G1. Any number of brands live in Postgres. The agent runs for each brand from DB data, with
  no `brand.json` on the production path.
- G2. An always-on worker container runs the agent on the weekly-plan and daily-check schedule
  for every active brand, without the owner's laptop.
- G3. Every post the agent creates is stored as a **draft row with its rendered images in
  Supabase Storage**, in status `pending_approval` (review) or `approved` (autopilot). The
  agent never publishes directly.
- G4. A Publisher interface exists. The only implementation in this sub-project wraps the
  existing Postiz code, so **carephoto's own account keeps posting** without interruption.
- G5. Brand members can sign in to a minimal web app and see their brands' drafts (read-only),
  which proves auth and tenancy end-to-end.
- G6. Existing carephoto history (posts, analytics, trends) is migrated from SQLite.

## Non-goals (later sub-projects)

Meta OAuth and publishing (2); the dashboard UI, approve/edit actions and the approval toggle UI
(3); onboarding, brand-profile derivation, product-photo upload UI and invites (4); Stripe and
quotas (5); multi-platform; upgrading the agent's Claude model (separate change).

## Architecture

```
marketing-agent/                    (npm workspaces)
├─ apps/
│  ├─ worker/   ← today's src/ moved here; long-running Node container (Railway)
│  │   ├─ src/orchestrator.ts, tools/*, config/*   (behaviour unchanged except where noted)
│  │   ├─ src/scheduler.ts     enqueue weekly_plan / daily_check runs per brand
│  │   ├─ src/run-loop.ts      claim + execute queued runs
│  │   ├─ src/publish-loop.ts  publish approved posts that are due
│  │   └─ src/cli.ts           `npm run agent -- --brand X --kind weekly_plan` (local dev)
│  └─ web/      ← Next.js App Router on Vercel: Supabase Auth + read-only drafts list
├─ packages/
│  └─ core/     ← DB types (generated), repository functions, BrandConfig mapping, storage helpers
├─ supabase/
│  └─ migrations/  ← schema + RLS
└─ brands/      ← kept only as seed input for scripts/seed-brand.ts
```

**Why a Postgres queue rather than Inngest (deviates from multi-tenant-product.md §4):** the
worker has to be a long-running container anyway (Puppeteer and Chromium), so a
`SELECT … FOR UPDATE SKIP LOCKED` queue in the same Postgres gives durable, retryable jobs with
no extra vendor. Inngest can be added later if fan-out grows.

**Worker hosting:** Railway, using a Dockerfile with Chromium for Puppeteer. One service, one
replica, run concurrency 2 (configurable). Fly.io is an equivalent alternative.

## Data model (Supabase Postgres)

Every tenant-owned table has `brand_id uuid not null references brands(id) on delete cascade`.

- **brands**: `id uuid pk`, `slug text unique`, `name`, `domain`, `niche`, `description`, `tone`,
  `keywords text[]`, `competitors jsonb`, `instagram_handle`, `design_system text`,
  `branding jsonb`, `carousel jsonb`, `hot_topics jsonb`, `image_generation jsonb`,
  `posting_schedule jsonb` (`{ coreDays: ['mon','wed','fri'], defaultTime: '10:00' }`),
  `timezone text not null` (IANA, e.g. `Europe/Istanbul`), `approval_mode text check in
  ('review','autopilot') default 'review'`, `status text check in ('active','paused') default
  'active'`, `publisher text null check in ('postiz')` (sub-project 2 extends this to `'meta'`),
  `created_at`.
  The JSON columns mirror the zod sub-schemas in `load-brand.ts`, which stays the single source
  of validation.
- **brand_members**: `(brand_id, user_id → auth.users)` pk, `role text check in
  ('owner','editor','viewer')`, `created_at`.
- **brand_assets**: `id`, `brand_id`, `kind text check in ('logo','font','icon','product')`,
  `storage_path`, `label text` (e.g. product name), `metadata jsonb`, `created_at`.
  Product photos are `kind='product'`. Upload UI comes in sub-project 4; in this sub-project they
  are seeded by script.
- **brand_sources**: `id`, `brand_id`, `source jsonb` (one entry of today's
  `hot-topics-sources.json`).
- **trends**: same columns as today plus `brand_id`. Today's table is global, but sources are per
  brand, so rows are brand-scoped. Unique on `(brand_id, url)`.
- **posts**: `id uuid`, `brand_id`, `run_id → agent_runs`, `kind text check in
  ('core','timely')`, `status text check in ('pending_approval','approved','publishing',
  'published','failed','rejected','expired')`, `planned_at timestamptz`, `caption`,
  `hashtags text[]`, `media jsonb` (ordered `[{storage_path, width, height}]`; more than one
  item means a carousel), `prompt_ids text[]`, `rationale text` (the agent's one-paragraph
  why), `external_post_id`, `published_at`, `publish_error`, `is_outlier bool`, `notes`,
  `created_at`, `updated_at`.
  This replaces both `posts` and `content_calendar` from SQLite.
- **post_metrics**: today's `analytics` columns, `post_id → posts`, `brand_id`, `measured_at`.
- **competitor_snapshots**: as today, plus `brand_id uuid`.
- **agent_runs**: `id`, `brand_id`, `kind text check in ('weekly_plan','daily_check','manual')`,
  `period_key text` (e.g. `2026-W43` or `2026-10-19`), `status text check in
  ('queued','running','succeeded','failed')`, `attempts int`, `heartbeat_at`, `started_at`,
  `finished_at`, `summary text`, `error text`, `input_tokens int`, `output_tokens int`,
  `image_count int`, `created_at`.
  `unique (brand_id, kind, period_key)` makes enqueueing idempotent.

**RLS:** helper `is_brand_member(brand_id)` (SECURITY DEFINER, checks `brand_members` for
`auth.uid()`). Every tenant table has a SELECT policy using it. No INSERT, UPDATE or DELETE for
`authenticated` in this sub-project; sub-project 3 adds narrow approve/edit policies or RPCs.
The worker and scripts use the service role.

**Storage:** private bucket `brand-assets` (`{brand_id}/…`) and private bucket `post-media`
(`{brand_id}/{post_id}/{n}.png`). Members read through signed URLs, enforced by storage policies
using `is_brand_member` on the first path segment. Publishers get short-lived signed URLs, which
is enough for Postiz and Meta to fetch from. This removes the tunnel, catbox and tmpfiles
fallbacks for new code.

## Worker behaviour

### Scheduler (`scheduler.ts`, ticks every minute)

For each `brands.status='active'`, in brand-local time:
- **weekly_plan** on Sunday at 09:00, with `period_key` = the ISO week being planned (the
  *coming* week).
- **daily_check** every day at 08:00, with `period_key` = local date.

Inserts use `on conflict do nothing`. A missed tick (worker down) is caught up on the next tick
if the scheduled time passed less than 6 hours ago. Older than that is skipped and logged.

### Run loop (`run-loop.ts`)

1. Claim: `update agent_runs set status='running', started_at=now(), heartbeat_at=now(),
   attempts=attempts+1 where id = (select id … where status='queued' order by created_at for
   update skip locked limit 1) returning *`.
2. Heartbeat every 30 s. A `running` row with a heartbeat older than 10 min is reset to `queued`
   (crash recovery). After 3 attempts it is set to `failed`.
3. Build the run context: load the brand row → `BrandConfig` (packages/core), and materialise
   brand assets (logo, font, icon, product photos) from Storage into a per-run temp dir so the
   existing tools keep working with local paths unchanged. Then refresh trends for that brand
   (best-effort, as today), call the brand's `publisher.fetchMetrics` if it has one (for
   carephoto, today's Postiz `ingestAnalytics` moved out of `runAgent`), and call `runAgent(brand, repo, { kind, periodKey })`.
4. On success, store the summary and token counts. On error, store the message. Either way,
   delete the temp dir. Run failures notify the platform owner (env `OWNER_EMAIL`), not the brand.

### Agent changes (`orchestrator.ts`)

- **DB access:** `src/db/queries.ts` becomes `packages/core/repo.ts`, with the same function
  names, async, on Postgres (`postgres` / postgres.js) and brand-scoped by `brand_id uuid`. The
  7 consumer files gain `await`. SQLite (`better-sqlite3`, `schema.ts` migrations) is removed
  from the production path.
- **`schedule_post` is replaced by `save_post`.** Input: `caption`, `hashtags`, `images` (local
  paths or URLs), `promptIds`, `plannedAt` (ISO, required), `kind` (`core|timely`) and
  `rationale`. It uploads each image to `post-media`, inserts a `posts` row with status
  `pending_approval` (review) or `approved` (autopilot), and returns the post id. It rejects
  `plannedAt` outside the run's window (below).
- **New read tool `get_planned_posts`:** returns this brand's non-terminal posts for the next 7
  days (planned_at, kind, caption first line, status), so a daily check doesn't duplicate the
  weekly plan and the weekly plan respects existing timely posts.
- **Briefs by kind:**
  - `weekly_plan`: "Plan and draft the core posts for {week} on {coreDays} at about
    {defaultTime} {timezone}. Each must have a rationale." Allowed window: that week.
  - `daily_check`: "Check today's hot topics and trends. Only if there is a strong, on-brand
    moment, draft at most ONE timely post for today or tomorrow. Otherwise, save nothing and
    explain why in your final message." Allowed window: now+2 h to end of tomorrow (local).
    In review mode, saving a timely post triggers an email to brand members ("1 timely post needs
    your OK by {planned_at}").
  - `manual`: free-form brief from the CLI, for testing.
- **System prompt:** the existing Moment-of-the-Week, energy, wildcard and moment-fit guidance
  stays as is. The brief changes; the creative rules don't.
- **Product photos:** `BrandConfig` gains `productPhotos: { path, label }[]`. A short prompt
  section lists them, and `generate_image` passes chosen ones as `referenceImages` once the
  carephoto Agent API supports it. Before then, the agent uses them only as-is (photo_overlay,
  brand_image, carousel).

### Expiry

The publish loop (every minute) also sets `pending_approval` posts whose `planned_at` has
passed to `expired`. Late
approval is never auto-published.

### Publish loop (`publish-loop.ts`, every minute)

```ts
interface Publisher {
  publish(post: PostWithSignedMedia): Promise<{ externalId: string }>;
  fetchMetrics?(posts: PublishedPost[]): Promise<PostMetricsInsert[]>;
}
```

- Selects `approved` posts with `planned_at <= now()` for brands that have a publisher, moves
  them to `publishing` (claimed with skip-locked), calls `publish`, then sets `published` or
  `failed` with `publish_error`. Failures are not retried automatically in this sub-project;
  they notify the owner.
- The publisher is chosen per brand from `brands.publisher text null`: `'postiz'` (carephoto
  only, wrapping today's `schedule-post.ts` with type `now` and signed URLs) or `null` (no
  publishing yet; posts wait in `approved`). Sub-project 2 adds `'meta'`.

## Web app (minimal, `apps/web`)

- Next.js App Router on Vercel, Supabase Auth (email magic link), `@supabase/ssr`.
- `/login`; `/` lists the brands you are a member of; `/brands/[slug]` shows a read-only table of
  upcoming and recent posts (thumbnail via signed URL, planned time in brand timezone, kind,
  status, caption excerpt).
- No editing, approval or design polish. This exists to prove auth, RLS and storage end-to-end.
  The real dashboard is sub-project 3.

## Seeding and migration (scripts)

- `scripts/seed-brand.ts <dir>`: reads a `brand.json`-style folder (validated by the existing zod
  schema), upserts the brand, uploads assets and product photos, inserts sources, and adds the
  owner as `owner` member. Used for carephoto, Kuanyin Skin and corterafashion. The owner
  supplies the Kuanyin and Cortera folders: name, IG handle, website, tone notes, logo and
  product photos. Fields can be drafted from their websites.
- `scripts/migrate-sqlite.ts`: one-off import of carephoto's `posts`, `analytics`,
  `competitor_snapshots` and `trends` into Postgres. Old posts become `published`; old
  `content_calendar` rows are not imported.

## Error handling summary

| Failure | Behaviour |
|---|---|
| Hot-topics scrape fails | Logged; run continues with stale trends (as today) |
| Agent throws or Anthropic errors | Run `failed` after 3 attempts; owner emailed |
| Worker crash mid-run | Stale heartbeat → run re-queued; posts already saved stay (save_post is per-post) |
| `save_post` image upload fails | Tool returns the error to the agent (it can retry); nothing half-inserted (upload first, then insert) |
| Publisher fails | Post `failed` + `publish_error`; owner emailed; no auto-retry |
| Draft not approved in time | `expired`; never published late |
| Duplicate schedule tick | Unique `(brand_id, kind, period_key)` makes it a no-op |

## Testing

- **Unit (vitest, existing setup):** BrandConfig mapping from rows; scheduler due-time
  calculation across timezones and DST; `save_post` window validation and status by approval
  mode; expiry; the publisher dispatch.
- **DB tests (PGlite):** repository functions, queue claim with skip-locked semantics, the
  idempotent enqueue, and heartbeat recovery.
- **RLS tests (local Supabase via `supabase start`):** a member sees only their brands' rows and
  media; a non-member sees nothing; `authenticated` cannot write.
- **End-to-end smoke (manual, documented):** seed a test brand → `npm run agent -- --brand test
  --kind weekly_plan` → drafts with images visible in the web app.
- The existing tool and orchestrator tests are kept and adapted to the async repo.

## Rollout

1. Supabase project + migrations; seed carephoto; import SQLite history.
2. Deploy the worker with only carephoto active, `publisher='postiz'`, `approval_mode='autopilot'`
   (matches today's behaviour). Retire the laptop cron once a week of posts goes out correctly.
3. Seed Kuanyin and Cortera in `review` mode, `publisher=null`. Drafts accumulate and are viewable
   in the web app while sub-projects 2–3 are built.

## Open items (do not block this spec)

- The final product name/domain (Carepost / carepost.art is the working choice).
- The carephoto Agent API PR (lula `feat/agent-api-prod`) must merge and deploy before
  `referenceImages` is used. Until then, product photos are used as-is.
- Brand timezones and core posting days for Kuanyin and Cortera, from the owner.
