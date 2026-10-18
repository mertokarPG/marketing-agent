# Carepost Dashboard UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bare web app with the designed Carepost dashboard (home, post view with edit/redo, calendar, results, brand placeholder, login) and the backend it needs (write RPCs, redo runs, versions, learnings).

**Architecture:** The web app stays anon-key + user session only; every write is a `SECURITY DEFINER` Postgres function (RPC) that checks membership and role. A redo is a new `agent_runs` kind `revise` that the worker claims with priority and executes with a slim tool set and a `revise_post` tool. The UI is server-rendered Next 16 App Router pages under `/b/[slug]`, with the post view as an intercepted overlay route.

**Tech Stack:** Next 16.3.8 / React 19.3.0, `@supabase/ssr` 0.12.7, `@supabase/supabase-js`, Postgres (Supabase) with PGlite tests, vitest 3.2.4, TypeScript 5.9.3, the worker's Anthropic tool runner and puppeteer.

**Spec:** `docs/superpowers/specs/2026-10-18-dashboard-ui-design.md` (read it first; section numbers below refer to it).

**Branch:** create worktree `~/GitHub/marketing-agent-dashboard` on new branch `feat/dashboard-ui` from `feat/saas-foundation` (HEAD `e20ad83`). Copy `apps/worker/.env` and `apps/web/.env.local` from `~/GitHub/marketing-agent-saas` (both gitignored). Never print their contents. Do not push. Do not apply migrations to the live database; that happens after the branch is reviewed.

## Global Constraints

- The web app never uses the service-role key (spec §3). Reads use RLS; writes only via the RPCs from Task 2.
- No internal terms visible to users: `pending_approval`, `core`, `timely`, `run`, `kind` (spec §2 anti-goals). All status copy comes from `apps/web/lib/labels.ts` (Task 4).
- Colour tokens exactly: `ink #060117`, `violet #1A0543`, `electric #6A36FF`, `cream #F4F0E9`, `pink #F12056`, `lavender #8E7BFF` (spec §4).
- Headline font Archivo at `font-stretch: 125%`, weights 300 and 800 via `next/font/google`; body General Sans 300/400/500/600 self-hosted woff2 in `apps/web/public/fonts/` (Fontshare, ITF Free Font License; downloading it is an outward action: ask the user before fetching).
- Dark is default; theme stored in cookie `cp-theme` = `dark|light`, read server-side (no flash).
- Times always rendered in the brand's timezone via `Intl` with `timeZone: brand.timezone`; local→UTC with `zonedTimeToUtc` from `@carepost/core`.
- Instagram limits: caption ≤ 2200 characters, carousel 1–10 slides.
- Redo: max 3 non-failed redos per post; refused when `planned_at - now() < 30 minutes`; refused for paused brands.
- Signed URL TTL for page images: 3600 seconds.
- Do not weaken the creative guidance in `apps/worker/src/config/system-prompt.ts`.
- Respect `prefers-reduced-motion`; focus rings in electric violet; Esc closes the post view, ←/→ step between posts.
- Every page works at 390px wide with a 16px gutter and no horizontal scroll.
- Commit after each task with a conventional message ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Two people act on one post at once** (A approves while B requests a redo): the second action fails with a plain message, never both apply. Owned by Task 2 (row lock + status re-check); test `concurrent redo after approve is refused`.
2. **The DST week** (Europe/Brussels falls back on Sun 2026-10-25): the week grid still has 7 days, and a post at `2026-10-25T01:30:00Z` lands on Sunday 25. Owned by Task 4; test `week grid across the October DST change`.
3. **A redo that dies** (worker crash or stale-run recovery marks the run failed): the post is restored to its snapshot and prior status, never stuck in "Reworking". Owned by Task 3; test `failed revise run restores the post` covering both `finishRun(failed)` and the `recoverStaleRuns` path.
4. **Hostile slide edits** (a storage path from another brand, `../`, a non-product asset): rejected by the RPC. Owned by Task 2; test `update_post_media rejects foreign and non-product paths`.
5. **A redo finishing after the posting time**: the post comes back needs-your-OK with `needs_new_time`, is not expired by the publish loop, and cannot be approved until rescheduled. Owned by Tasks 1 and 3; tests `expirePendingPosts skips needs_new_time` and `late revise sets needs_new_time`.

---

### Task 1: Schema for statuses, redos, versions, insights

**Files:**
- Create: `supabase/migrations/20261018120000_dashboard_schema.sql`
- Modify: `packages/core/src/repo/posts.ts` (types + `expirePendingPosts`, `expireMissedApprovedPosts`), `packages/core/src/repo/runs.ts` (`RunKind`, `claimNextRun` priority)
- Test: `packages/core/tests/dashboard-schema.test.ts`

**Interfaces:**
- Produces (SQL):
  - `posts.status` check adds `'reworking'`.
  - New `posts` columns: `needs_new_time boolean not null default false`, `last_changed_by uuid references auth.users(id)`, `last_changed_at timestamptz`.
  - `agent_runs.kind` check adds `'revise'`.
  - `post_versions(id uuid pk default gen_random_uuid(), post_id uuid not null references posts on delete cascade, brand_id uuid not null references brands on delete cascade, caption text not null, hashtags text[] not null, media jsonb not null, planned_at timestamptz not null, reason text not null check (reason in ('redo','restore')), feedback text, created_by uuid, created_at timestamptz not null default now())`.
  - `post_revisions(id uuid pk default gen_random_uuid(), post_id uuid not null references posts on delete cascade, brand_id uuid not null references brands on delete cascade, requested_by uuid not null, feedback text not null, prior_status text not null, version_id uuid not null references post_versions, status text not null default 'queued' check (status in ('queued','running','done','failed')), error text, created_at timestamptz not null default now(), finished_at timestamptz)`.
  - `brand_insights(id uuid pk default gen_random_uuid(), brand_id uuid not null references brands on delete cascade, week_key text not null, body text not null, created_at timestamptz not null default now(), unique (brand_id, week_key))`.
  - Member SELECT policies on the three new tables (same pattern as the foundation loop: `is_brand_member(brand_id)`).
- Produces (TS): `PostStatus` gains `"reworking"`; `PostRow` gains `needs_new_time: boolean; last_changed_by: string | null; last_changed_at: Date | null`; `RunKind` gains `"revise"`; `MediaItem` gains `bucket?: "post-media" | "brand-assets"` (absent = `post-media`).

- [ ] **Step 1: Write failing tests** in `dashboard-schema.test.ts` (use `createTestDb`, `seedTestBrand`, `addTestMember`, and the `asUser` helper pattern from `schema-rls.test.ts`):
  - `posts accept the reworking status` (insert with `status='reworking'` succeeds).
  - `expirePendingPosts skips needs_new_time`: a past `pending_approval` post with `needs_new_time=true` stays pending; one without it becomes `expired`.
  - `expireMissedApprovedPosts skips brands without a publisher`: approved post 7h past, brand `publisher=null` → still `approved`; same with `publisher='postiz'` → `expired`.
  - `claimDuePosts ignores reworking posts`.
  - `claimNextRun prefers revise runs`: enqueue a `weekly_plan` then a `revise` (period_key = a uuid); first claim returns the `revise`.
  - `members can read their brand's versions, revisions and insights; strangers see none`.
- [ ] **Step 2: Run** `npm test -w @carepost/core -- dashboard-schema` → FAIL (constraint / missing table).
- [ ] **Step 3: Write the migration and TS changes.** Migration must be idempotent (`if not exists`, `drop constraint if exists` then re-add). `expireMissedApprovedPosts` adds `and brand_id in (select id from brands where publisher is not null)`. `expirePendingPosts` adds `and not needs_new_time`. `claimNextRun` orders by `(r.kind = 'revise') desc, r.created_at`.
- [ ] **Step 4: Run** `npm test -w @carepost/core` → all pass (existing 52 + new).
- [ ] **Step 5: Commit** `feat(db): reworking status, revise runs, post versions and brand insights`.

### Task 2: Write RPCs for the web app

**Files:**
- Create: `supabase/migrations/20261018120100_dashboard_rpcs.sql`
- Test: `packages/core/tests/dashboard-rpcs.test.ts`

**Interfaces:**
- Consumes: Task 1 schema.
- Produces (all `language plpgsql security definer set search_path = public, pg_temp`, `grant execute ... to authenticated`, `revoke ... from public, anon`). Each locks the post row (`select ... for update`), requires `auth.uid()` to be an `owner` or `editor` member of the post's brand, and raises `exception` with these exact message codes, which the web maps to copy:
  `carepost:not_allowed` (no membership / viewer), `carepost:not_found`, `carepost:not_editable` (status not in `pending_approval`,`approved`), `carepost:reworking`, `carepost:in_past`, `carepost:needs_new_time`, `carepost:caption_too_long`, `carepost:invalid_media`, `carepost:redo_limit`, `carepost:too_close`, `carepost:paused`.
  - `approve_post(p_post uuid) returns void`: pending → approved; requires `planned_at > now()` and `not needs_new_time`.
  - `unapprove_post(p_post uuid) returns void`: approved → pending_approval.
  - `skip_post(p_post uuid) returns void`: pending/approved → rejected.
  - `update_post_caption(p_post uuid, p_caption text, p_hashtags text[]) returns void`: `char_length(p_caption) <= 2200`.
  - `reschedule_post(p_post uuid, p_planned_at timestamptz) returns void`: `p_planned_at > now()`; clears `needs_new_time`.
  - `update_post_media(p_post uuid, p_media jsonb) returns void`: 1–10 items; each item `{storage_path, bucket?}`; `post-media` paths must start with `<brand_id>/<post_id>/`; `brand-assets` paths must equal a `brand_assets.storage_path` of kind `product` for this brand; no `..`.
  - `request_post_redo(p_post uuid, p_feedback text) returns uuid` (revision id): checks paused brand, `planned_at - now() >= interval '30 minutes'`, count of this post's revisions with status <> 'failed' < 3, feedback 1–500 chars; inserts a `post_versions` snapshot (`reason='redo'`, feedback), a `post_revisions` row (`prior_status` = current status), sets post `status='reworking'`, enqueues `agent_runs(brand_id, 'revise', period_key = revision id)`.
  - `restore_post_version(p_version uuid) returns void`: snapshots current state (`reason='restore'`), copies the version's caption/hashtags/media/planned_at onto the post; post must be editable.
  - Every successful edit RPC sets `last_changed_by = auth.uid(), last_changed_at = now()`; approved posts stay approved (spec §5.3).

- [ ] **Step 1: Write failing tests** in `dashboard-rpcs.test.ts`, calling `select approve_post($1)` etc. through `asUser` (role `authenticated`):
  - `owner approves a pending post`; `viewer cannot approve` (`carepost:not_allowed`); `stranger cannot approve` (`carepost:not_allowed`).
  - `approve refuses past posts` (`carepost:in_past`) and `needs_new_time posts` (`carepost:needs_new_time`).
  - `editing an approved post keeps it approved and records last_changed_by`.
  - `caption over 2200 characters is refused` (`carepost:caption_too_long`).
  - `reschedule refuses the past and clears needs_new_time`.
  - `update_post_media rejects foreign and non-product paths` (another brand's prefix, `../`, a `logo` asset, 0 and 11 items → `carepost:invalid_media`); accepts a reorder and a product asset with `bucket:'brand-assets'`.
  - `request_post_redo snapshots, locks and enqueues`: returns a uuid; post `reworking`; one `post_versions` row with the feedback; one queued `agent_runs` row of kind `revise` with `period_key` = revision id.
  - `redo limits`: fourth redo → `carepost:redo_limit` (failed revisions don't count); within 30 minutes → `carepost:too_close`; paused brand → `carepost:paused`.
  - `all edits are refused while reworking` (`carepost:reworking`).
  - `concurrent redo after approve is refused`: approve, then a redo on a now-approved post succeeds (approved is editable), but a second `request_post_redo` while reworking fails with `carepost:reworking`.
  - `restore_post_version swaps in the old version and snapshots the current one`.
- [ ] **Step 2: Run** `npm test -w @carepost/core -- dashboard-rpcs` → FAIL.
- [ ] **Step 3: Write the migration.**
- [ ] **Step 4: Run** `npm test -w @carepost/core` → all pass.
- [ ] **Step 5: Commit** `feat(db): role-checked write RPCs for the dashboard`.

### Task 3: Worker: revise runs and agent learnings

**Files:**
- Create: `packages/core/src/repo/revisions.ts`, `packages/core/src/repo/insights.ts`, `apps/worker/src/runtime/revise.ts`, `apps/worker/src/tools/revise-post.ts`, `apps/worker/src/tools/save-learnings.ts`
- Modify: `packages/core/src/index.ts` (exports), `apps/worker/src/runtime/run-loop.ts` (dispatch `revise`; restore on final failure, including `recoverStaleRuns` failed runs), `apps/worker/src/orchestrator.ts` (`buildTools` takes an optional `mode: "plan" | "revise"`; revise mode drops `save_post`, `get_planned_posts`, scraping/competitor tools and adds `revise_post`; plan mode adds `save_learnings` for `weekly_plan`), `apps/worker/src/runtime/windows.ts` (`buildBrief` handles `revise`), `apps/worker/src/runtime/publish-loop.ts` (sign each media item from `m.bucket ?? BUCKETS.media`)
- Test: `apps/worker/tests/revise.test.ts`, `apps/worker/tests/save-learnings.test.ts`, extend `apps/worker/tests/publish-loop.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2 tables; `RunDeps`, `executeRun`, `savePost`'s image loading (`loadImageSource`) and upload pattern.
- Produces:
  - `getRevision(db, id: string): Promise<RevisionRow | null>`; `markRevision(db, id, status: "running" | "done" | "failed", error?: string): Promise<void>`; `restoreAfterFailedRevision(db, revisionId: string): Promise<void>` (copies the revision's version back onto the post and sets `status = prior_status`) in `repo/revisions.ts`.
  - `upsertInsight(db, brandId, weekKey: string, body: string): Promise<void>`; `listInsights(db, brandId, limit: number)` in `repo/insights.ts`.
  - `revisePost(db, brand, ctx, revision, input: { caption: string; hashtags: string[]; images: string[]; rationale: string }, deps?): Promise<string>` in `tools/revise-post.ts`: loads/validates images exactly like `save_post` (1–10), uploads to `${brandId}/${postId}/r${n}-${i}.${ext}`, updates the post (`status='pending_approval'`, caption, hashtags, media, rationale, `last_changed_at = now()`, `last_changed_by = null`), marks the revision `done`. If `planned_at <= now() + 15 minutes`, also sets `needs_new_time = true`. One successful call per run; a second call is rejected.
  - `save_learnings` tool (`weekly_plan` only): input `{ learnings: string[] }` (2–3 items, each ≤ 200 chars), writes `upsertInsight(brandId, periodKey, learnings.join("\n"))`.
  - `buildBrief(brand, "revise", revisionId, now, …)` includes the current caption, hashtags, slide count, the user's feedback verbatim, and the instruction to keep the date/time unless the feedback asks otherwise and to call `revise_post` exactly once. The weekly brief gets one added line asking for `save_learnings` with 2–3 plain-language learnings from recent performance.
  - `executeRun` for `revise`: skips scrape and metrics ingest, marks the revision `running`, runs the agent with `mode: "revise"`, then requires the revision to be `done`; if not, it throws (`"agent did not revise the post"`), which uses the existing retry/fail path. On final failure (both the `finishRun(failed)` branch and `runLoopTick`'s `failedRuns`), call `restoreAfterFailedRevision` and `markRevision(..., "failed")`. A revise run for a paused brand is never claimed (existing `b.status = 'active'` filter), so `sweepStuckRevisions(db, olderThanMinutes = 10): Promise<number>` in `repo/revisions.ts` (called from `runLoopTick`) restores and fails queued revisions of paused brands older than 10 minutes, and their runs are marked failed; a post never stays reworking. Test: `paused brand redo is swept back`.
  - Revise mode keeps `generate_image`, `compose_image_prompt`, the prompt bank, brand image/overlay/carousel tools and `list_brand_assets`-style product photo access, so a redo can create new images when the brand's image generation is enabled (spec §5.3).

- [ ] **Step 1: Write failing tests** (worker tests use the PGlite test DB and a fake `agent` function in `RunDeps`, like the existing run-loop tests):
  - `revise run updates the post and returns it for review`: fake agent calls `revisePost`; post becomes `pending_approval` with the new caption; revision `done`; run `succeeded`.
  - `late revise sets needs_new_time`: post planned 5 minutes ahead → `needs_new_time = true`.
  - `failed revise run restores the post`: fake agent throws on every attempt → after max attempts the post has its snapshot caption and `prior_status`, revision `failed`. Second case: a stale `running` revise run recovered by `recoverStaleRuns` as failed → same restore.
  - `revise runs are claimed before weekly plans` (through `runLoopTick`).
  - `revise mode has no save_post and has revise_post` (inspect `buildTools(..., "revise")` names).
  - `save_learnings writes one insight per week` (second call same week replaces).
  - `publish signs brand-assets media from the brand-assets bucket`.
- [ ] **Step 2: Run** `npm test -w @carepost/worker -- revise save-learnings publish-loop` → FAIL.
- [ ] **Step 3: Implement** the interfaces above.
- [ ] **Step 4: Run** `npm test -w @carepost/worker` → all pass except the known pre-existing `prompt-bank.test.ts` failure; `npx tsc -p apps/worker --noEmit` clean.
- [ ] **Step 5: Commit** `feat(worker): revise runs with version restore, and weekly learnings`.

### Task 4: Web foundations: tokens, fonts, theme, labels, week math

**Files:**
- Create: `apps/web/app/globals.css`, `apps/web/app/fonts.ts`, `apps/web/public/fonts/GeneralSans-{Light,Regular,Medium,Semibold}.woff2`, `apps/web/public/grain.png`, `apps/web/scripts/make-grain.mjs`, `apps/web/lib/labels.ts`, `apps/web/lib/week.ts`, `apps/web/lib/theme.ts`, `apps/web/lib/rpc-errors.ts`, `apps/web/components/ribbon.tsx`, `apps/web/components/theme-toggle.tsx`
- Modify: `apps/web/app/layout.tsx`, `apps/web/next.config.ts` (`agentRules: false`, and delete the generated `apps/web/AGENTS.md` / `apps/web/CLAUDE.md`), `apps/web/lib/format.ts`
- Test: `apps/web/lib/labels.test.ts`, `apps/web/lib/week.test.ts`, `apps/web/lib/rpc-errors.test.ts`

**Interfaces:**
- Produces:
  - `postLabel(p: { status: string; planned_at: string; needs_new_time: boolean }, brand: { publisher: string | null; approval_mode: string }, now: Date): { text: string; tone: "needs" | "ok" | "muted" | "busy" }`. Exact copy: pending → "Needs your OK" (needs); pending + needs_new_time → "Pick a new time" (needs); approved + publisher → "Scheduled" (ok); approved + no publisher + future → "Ready · not connected to Instagram yet" (muted); approved + no publisher + past → "Ready · wasn't posted (Instagram not connected)" (muted); publishing → "Posting…" (busy); published → "Posted" (ok); reworking → "Reworking…" (busy); rejected → "Skipped" (muted); failed or expired → "Didn't go out" (muted).
  - `buildWeek(posts: { id: string; planned_at: string }[], weekStartYmd: string, tz: string): { ymd: string; weekday: string; dayNum: number; posts: typeof posts }[]` (always 7 entries Mon–Sun; posts sorted by time); `currentWeekStart(now: Date, tz: string): string`; `buildMonth(...)` same shape for the 6×7 calendar grid.
  - `rpcErrorMessage(err: { message?: string }): string` mapping each `carepost:*` code from Task 2 to plain copy (e.g. `carepost:too_close` → "Too close to posting time to rework. Edit it yourself or skip it."; `carepost:redo_limit` → "You've used the redos for this post. Edit it yourself or skip it."; unknown → "Something went wrong. Please try again.").
  - `getTheme(): Promise<"dark" | "light">` (reads cookie `cp-theme`, default dark); `<ThemeToggle />` client component setting the cookie and `data-theme` on `<html>`.
  - `<Ribbon />` server component: the grain ribbon from spec §4 (two rotated ellipses, borders `#F12056` and `#6A36FF`, blur, plus two grain layers using `/grain.png` at 240px and 800px with the dark/light opacities from spec §4), absolutely positioned, `aria-hidden`, `pointer-events: none`.
  - CSS custom properties for every token; utility classes `.wide` (Archivo 125%), `.pill`, `.card`, `.tag`, `.rule`; `[data-theme="light"]` overrides per spec §4.
  - `make-grain.mjs` reproduces `apps/worker/src/lib/gradient.ts`'s tile (240px, density 0.45, seed 7) with `sharp` and writes `public/grain.png`; run once, commit the PNG.
- [ ] **Step 1: Write failing tests:** every `postLabel` row above (table-driven); `week grid across the October DST change` (week of `2026-10-19`, tz `Europe/Brussels`: 7 days, Sunday is `2026-10-25`, a post at `2026-10-25T01:30:00Z` is in Sunday's bucket, a post at `2026-10-19T21:59:00Z` is on Monday and one at `2026-10-19T22:00:00Z` is on Tuesday); `currentWeekStart` on a Sunday evening returns that week's Monday; `rpcErrorMessage` for every code.
- [ ] **Step 2: Run** `npm test -w @carepost/web` → FAIL.
- [ ] **Step 3: Implement**; ask the user before downloading the General Sans files.
- [ ] **Step 4: Run** `npm test -w @carepost/web` and `npm run typecheck -w @carepost/web` → pass.
- [ ] **Step 5: Commit** `feat(web): design tokens, fonts, theme, labels and week math`.

### Task 5: App shell, routing, login, screenshot tool

**Files:**
- Create: `apps/web/app/b/[slug]/layout.tsx`, `apps/web/app/b/[slug]/brand-context.ts`, `apps/web/components/nav.tsx`, `apps/web/components/brand-switcher.tsx`, `apps/web/components/footer.tsx`, `apps/web/app/auth/confirm/route.ts`, `apps/worker/scripts/screens.ts`
- Modify: `apps/web/app/page.tsx` (redirect / brand list), `apps/web/app/login/page.tsx` (restyle), remove `apps/web/app/brands/[slug]/page.tsx` (redirect `/brands/:slug` → `/b/:slug` in `next.config.ts`)
- Test: `apps/web/lib/brand-context.test.ts` (pure helpers only)

**Interfaces:**
- Produces:
  - `loadBrand(slug: string): Promise<BrandView>` (React `cache`d) where `BrandView = { id; slug; name; timezone; approval_mode; status; publisher; instagram_handle; role: "owner" | "editor" | "viewer"; logoUrl: string | null }`; `notFound()` for non-members.
  - `canEdit(role): boolean` (owner/editor).
  - Shell: nav (wordmark **CARE**POST, tabs Home/Calendar/Brand/Results linking to `/b/[slug]`, `/calendar`, `/brand`, `/results`, active underlined), brand switcher pill (menu only when the user has more than one brand, keeps the current tab), theme toggle, footer "by carephoto", bottom tab bar under 640px.
  - `/` redirects to `/b/<slug>` with one brand, otherwise lists brands in the shell style; zero brands: "You're not part of a brand yet. Ask the brand owner to invite you."
  - `/auth/confirm?token_hash&type&next`: `verifyOtp({ token_hash, type })`, then redirect via `safeNextPath`.
  - Login restyled (spec §5.7): headline "SIGN **IN.**", email field, "Send me a link ↳", sent state "Check your email. The link signs you in on this device."
  - `apps/worker/scripts/screens.ts <path> <out.png> [--width 1440|390] [--theme dark|light]`: uses the service-role key from `apps/worker/.env` to `auth.admin.generateLink({ type: "magiclink", email: OWNER_EMAIL })`, opens `http://localhost:3000/auth/confirm?token_hash=…&type=magiclink&next=<path>` in the worker's `launchBrowser`, sets the theme cookie, screenshots. Local dev tool only; prints only the output path.
- [ ] **Step 1: Write failing tests** for `canEdit` and the switcher's "keep the current tab" path helper `switchHref(currentPath: string, toSlug: string): string` (`/b/a/results` → `/b/b/results`; `/b/a/posts/x` → `/b/b`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** tests + typecheck → pass.
- [ ] **Step 5: Visual check:** with `npm run dev -w @carepost/web` running, `npx tsx apps/worker/scripts/screens.ts /login …` and `/b/carephoto` at 1440 and 390, dark and light; open the PNGs and confirm nav, ribbon, fonts and no horizontal scroll.
- [ ] **Step 6: Commit** `feat(web): app shell, brand routing, restyled login`.

### Task 6: Home

**Files:**
- Create: `apps/web/app/b/[slug]/page.tsx`, `apps/web/app/b/[slug]/home-data.ts`, `apps/web/components/needs-you-card.tsx`, `apps/web/components/week-grid.tsx`, `apps/web/components/post-tile.tsx`, `apps/web/components/results-strip.tsx`, `apps/web/lib/greeting.ts`
- Test: `apps/web/lib/greeting.test.ts`, `apps/web/app/b/[slug]/home-data.test.ts` (pure shaping functions)

**Interfaces:**
- Consumes: `loadBrand`, `buildWeek`, `postLabel`, `<Ribbon />`.
- Produces: `greeting(now: Date, tz: string, firstName: string | null): string` ("GOOD MORNING" 05:00–11:59, "GOOD AFTERNOON" 12:00–17:59, "GOOD EVENING" otherwise; name fallback "there"; first name = email local part before `.`/`+`/digits, capitalised); `<PostTile post href />` (4:5 signed thumbnail or a placeholder showing the caption's first words; status tag from `postLabel`); `waitingPosts(posts)` (pending, not reworking, future, sorted).
- Page per spec §5.2: greeting + lede (variants: review with waiting posts; nothing waiting; autopilot; no publisher: "nothing goes out until Instagram is connected"; paused: "Carepost is paused for this brand. Nothing will be planned or posted."; empty week: "Your first plan arrives Sunday morning."), needs-you card (review mode and waiting > 0), week with `?week=YYYY-MM-DD` navigation, results strip (last 7 days reach, change vs previous 7 days, best post by reach), closing line "POST **WITH CARE.**".
- Signed URLs: one `createSignedUrls` call per bucket for all tiles, TTL 3600.
- [ ] **Step 1: Failing tests:** `greeting` boundaries in Brussels; `waitingPosts` excludes reworking, past and approved; the lede variant chooser `homeLede(brand, waitingCount, weekHasPosts)` returns each exact string above.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → pass.
- [ ] **Step 5: Visual check** of `/b/carephoto` (1440/390, dark/light) against `.superpowers/brainstorm/98493-1792325158/content/jolt-direction.html` in the main repo.
- [ ] **Step 6: Commit** `feat(web): home with needs-you card, week and results strip`.

### Task 7: Post view (read, approve, edit caption and time)

**Files:**
- Create: `apps/web/app/b/[slug]/posts/[id]/page.tsx` (full page), `apps/web/app/b/[slug]/@modal/(.)posts/[id]/page.tsx` + `apps/web/app/b/[slug]/@modal/default.tsx` (overlay), `apps/web/app/b/[slug]/posts/[id]/actions.ts`, `apps/web/components/post-view/{post-view.tsx,instagram-preview.tsx,caption-editor.tsx,time-picker.tsx,post-actions.tsx,post-results.tsx}`, `apps/web/app/b/[slug]/posts/[id]/post-data.ts`
- Modify: `apps/web/app/b/[slug]/layout.tsx` (render the `modal` slot)
- Test: `apps/web/app/b/[slug]/posts/[id]/post-data.test.ts`

**Interfaces:**
- Consumes: Task 2 RPCs, `rpcErrorMessage`, `postLabel`, `zonedTimeToUtc`.
- Produces:
  - Server actions (each `"use server"`, calls `supabase.rpc(name, args)`, returns `{ ok: true } | { ok: false; message: string }`, then `revalidatePath(\`/b/${slug}\`)`): `approve(slug, postId)`, `unapprove(slug, postId)`, `skip(slug, postId)`, `saveCaption(slug, postId, caption, hashtags)`, `reschedule(slug, postId, localYmd, localHhmm)` (converts with `zonedTimeToUtc` and the brand tz).
  - `parseCaption(text: string): { caption: string; hashtags: string[] }` and `joinCaption(caption, hashtags): string` (hashtags edited inline as trailing `#tags`).
  - `stepNav(waitingIds: string[], currentId: string): { prev: string | null; next: string | null; index: number; total: number }`.
  - Post view per spec §5.3: header "{WEEKDAY} **POST**" + "‹ n of N ›" (only when opened from the waiting list, `?review=1`), Instagram preview (handle from `instagram_handle`, avatar = logo, current slide, dots, caption truncated to two lines + "…more"), read-only slide sheet (editing arrives in Task 8), "Goes out" + format chip + Change time, caption editor (autosave debounce 800ms, "Saved ✓", soft warning from 2,000 characters, hard stop 2,200), "Why this post", actions by status and mode (review: Approve ↳ / Save & decide later / Skip this post; approved: "Approved ✓" + Undo; autopilot: Keep / Pull this post; posted: results panel with reach, saves, shares, likes, comments; viewer: read-only), "Last changed by {name}, {when}" when set. Esc closes, ←/→ step.
- [ ] **Step 1: Failing tests:** `parseCaption`/`joinCaption` round-trip (incl. no hashtags and hashtags mid-text staying in the caption); `stepNav` first/middle/last.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** tests + typecheck → pass.
- [ ] **Step 5: Manual check** against the live dev DB: approve, undo, skip and a caption edit on a carephoto draft (create one via `npm run agent -- --brand carephoto --kind manual` in the worker only if none exists; reject it afterwards). Visual check of overlay and full page at 1440/390.
- [ ] **Step 6: Commit** `feat(web): post view with approve, caption and time editing`.

### Task 8: Post view: slides, redo, versions

**Files:**
- Create: `apps/web/components/post-view/{slide-sheet.tsx,product-picker.tsx,redo-panel.tsx,version-list.tsx,reworking-state.tsx}`
- Modify: `apps/web/app/b/[slug]/posts/[id]/actions.ts` (add actions), `apps/web/components/post-view/post-view.tsx`, `apps/web/components/post-tile.tsx` (reworking veil)
- Test: `apps/web/lib/slides.test.ts`

**Interfaces:**
- Consumes: `update_post_media`, `request_post_redo`, `restore_post_version`; `post_revisions`/`post_versions` reads.
- Produces:
  - Actions: `saveSlides(slug, postId, media: MediaItem[])`, `requestRedo(slug, postId, feedback: string)`, `restoreVersion(slug, versionId)`.
  - `moveSlide(media, from, to)`, `removeSlide(media, index)` (refuses to drop the last slide), `addProduct(media, assetPath)` (refuses an 11th) in `apps/web/lib/slides.ts`.
  - `redoFeedback(typed: string, picks: string[]): string` joining quick picks ("Shorter caption", "Different photos", "More playful", "More professional") and typed text with ". ".
  - Slide sheet: numbered tiles (`01.`…), drag to reorder (pointer + keyboard: focus a tile, Alt+←/→), ✕ to remove, "+ Add a product photo" opening a picker of `brand_assets` kind `product` (empty state: "No product photos yet. Add them on the Brand page soon.").
  - Redo panel: free text (≤500) + quick picks + "Redo ↳"; hidden for viewers, for posts not editable, and replaced by the server's reason when refused. Reworking state: dimmed preview, "Reworking: '{feedback}'… about {2|4} minutes" (4 when the brand has image generation enabled), polling the post every 10 seconds with `router.refresh()` until status changes; failure copy "The agent couldn't rework this one. Your post is unchanged." when the latest revision is `failed` and newer than the page load.
  - Version list: "Previous version" button flips to the newest version; a list (newest first) "Version from {when}, before redo: '{feedback}'" / "…, before restoring", each with Restore.
  - Tile veil on the week grid for reworking posts.
- [ ] **Step 1: Failing tests:** `moveSlide`, `removeSlide` (last slide refused), `addProduct` (11th refused), `redoFeedback` combinations.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → pass.
- [ ] **Step 5: End-to-end check** with the worker running locally (`npm run dev -w @carepost/worker` or `main.ts`) against the dev DB: request a redo on a carephoto draft, see Reworking, see the new version return, restore the previous one. Reject the test draft afterwards.
- [ ] **Step 6: Commit** `feat(web): slide editing, redo requests and version history`.

### Task 9: Calendar, Results, Brand placeholder

**Files:**
- Create: `apps/web/app/b/[slug]/calendar/page.tsx`, `apps/web/app/b/[slug]/results/page.tsx`, `apps/web/app/b/[slug]/results/results-data.ts`, `apps/web/components/trend-line.tsx`, `apps/web/app/b/[slug]/brand/page.tsx`
- Test: `apps/web/app/b/[slug]/results/results-data.test.ts`

**Interfaces:**
- Consumes: `buildMonth`, `<PostTile />`, `post_metrics`, `brand_insights`.
- Produces:
  - `latestMetricsPerPost(rows)` (latest `measured_at` per post); `windowTotals(metrics, posts, from, to): { reach: number; savesShares: number }`; `changePct(cur, prev): number | null` (null when prev is 0); `bestPosts(posts, metrics, from, to, n = 3)` (by reach, tie → saves); `weeklyReach(posts, metrics, now, tz, weeks = 13): { weekStart: string; reach: number }[]`.
  - Calendar (spec §5.4): month grid with ‹ › (`?month=YYYY-MM`), small tiles, phone vertical list.
  - Results (spec §5.5): three big numbers (people reached, saves & shares, and the followers slot "Followers appear once Instagram is connected"), best 3 posts with numbers and a one-line reason (first sentence of the rationale), "What the agent learned" from the newest `brand_insights` (hidden when none), the 13-week trend as a hand-rolled SVG line (no chart library), empty state "Your results appear here once your first posts go out."
  - Brand placeholder (spec §5.6): name, logo, timezone, posting days, approval mode in plain words, "Brand setup is coming soon".
- [ ] **Step 1: Failing tests** for each results helper (including `changePct(5, 0) === null` and metrics where only the latest snapshot per post counts).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → pass.
- [ ] **Step 5: Visual check** of all three pages (1440/390, dark/light).
- [ ] **Step 6: Commit** `feat(web): calendar, results and brand placeholder`.

### Task 10: Re-attach the surviving old carephoto images

**Files:**
- Create: `apps/worker/scripts/attach-legacy-images.ts`
- Test: `apps/worker/tests/attach-legacy-images.test.ts`

**Interfaces:**
- Produces: `planLegacyAttachments(rows: { id: string; notes: string | null; media: unknown[] }[], exists: (p: string) => boolean): { postId: string; file: string }[]`: takes the local path recorded in `notes` (the import stored the old `image_url` there), keeps posts whose media is empty and whose file exists, and drops any file referenced by more than one post. The CLI (`npm run attach-legacy-images -- <brand-slug> [--dry-run]`) uploads each file to `post-media` at `${brandId}/${postId}/0.<ext>` and sets `media = [{storage_path}]`. Idempotent (skips posts with media).
- [ ] **Step 1: Failing tests** for `planLegacyAttachments` (missing file skipped, shared file skipped, post with media skipped, path parsed from `notes` that also contain other text).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → pass.
- [ ] **Step 5: Dry run** against the dev DB: `--dry-run` prints 26 planned uploads (28 posts whose file still exists, minus the 2 posts that share one overwritten file). Do not run without `--dry-run` until the user confirms.
- [ ] **Step 6: Commit** `feat(worker): script to re-attach surviving legacy carephoto images`.

### Task 11: Final pass

**Files:** any touched above.

- [ ] **Step 1:** Run all suites: `npm test -w @carepost/core`, `npm test -w @carepost/worker` (only the known `prompt-bank.test.ts` failure), `npm test -w @carepost/web`, all three typechecks, `npm run build -w @carepost/web`.
- [ ] **Step 2:** Screens at 1440 and 390, dark and light, for login, home, post view (overlay and full page), calendar, results and brand; check against spec §2 anti-goals: no internal terms, no horizontal scroll, labels from `labels.ts` only (`grep -rn "pending_approval\|\"core\"\|timely" apps/web/app apps/web/components` finds no user-visible strings).
- [ ] **Step 3:** Update `docs/runbooks/carepost-foundation-rollout.md` with a "Dashboard rollout" section: apply the two new migrations (`supabase db push --dry-run`, then push) and deploy the worker before the web app, so revise runs have a consumer.
- [ ] **Step 4: Commit** `docs: dashboard rollout steps`.
