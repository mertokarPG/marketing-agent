# Carepost foundation: implementation rulings and spec amendments

Decisions taken during subagent-driven execution of docs/superpowers/plans/2026-10-17-saas-foundation.md. Each line: what was decided, why, and the cost if it is wrong. These amend the spec where they differ.

- PF1 Ruling: gates read "no NEW failures"; pre-existing prompt-bank "2 items" failure stays exempt and unfixed — out of scope — cost if wrong: one red test lingers.
- PF2 Ruling: delete src/index.ts + utils/detect-tunnel.ts (and node-cron usage) in Task 7, not Task 13; Task 13 creates main.ts fresh — keeps tsc at 0 errors from T7 on — cost: T13 brief text references removal that already happened.
- PF3 Ruling: Task 1 keeps `start: tsx src/index.ts` (pure move); Task 13 switches to main.ts — plan text self-contradicts; pure-move intent wins — cost: none.
- PF4 Ruling: Task 9 renames every remaining `schedule_post` / content-calendar reference (orchestrator.ts, prompt-bank.ts, generate-image.ts, system-prompt.ts:142-143) to save_post wording, mechanically; creative guidance untouched — cost: minor prompt wording drift.
- PF5 Ruling: spec wins — weekly_plan brief says core posts "at about {defaultTime}"; guard is one core post per local date, time may flex within that day — preserves protected energy-timing rule — cost: posts at non-10:00 times.
- PF6 Ruling: catch-up >6h is skipped AND logged (console.warn with brand/kind/period_key) + test in Task 10 — spec + GC require it — cost: none.
- PF7 Ruling: recoverStaleRuns returns rows it moved to failed; run loop emails owner for them; test in Task 11 — spec error table — cost: none.
- PF8 Ruling: Task 13 runs npm install after creating apps/web placeholder package.json and commits it + regenerated package-lock.json — Docker npm ci must work — cost: none.
- PF9 Ruling: Task 1 git-mv's .env.example to apps/worker/.env.example and moves local untracked .env (worktree has none; note for user) — worker cwd is apps/worker — cost: none.
- PF10 Ruling: get_planned_posts queries planned_at in [now, max(now+7d, window.end)] — weekly window can extend past +7d — cost: none.
- PF11 Ruling: accept the 5 declared deviations (PGlite RLS tests; Publisher.ingestMetrics(brand, db) instead of fetchMetrics; brands.prompt_bank_path column; post-media path `{n}.{ext}`; media items without width/height) as amendments to the spec — all strictly simpler/equivalent — cost if wrong: spec text and code differ until spec is amended at finish.
- PF12 Ruling: timely-post email goes to ALL brand members (spec S196 "brand members") — cost: viewers get emails.
- PF13 Ruling: Task 11 run-loop test asserts publisher.ingestMetrics called once, plus a case where ingestMetrics throws and run still succeeds (best-effort) — cost: none.
- PF14 Ruling: Runbook (Task 16) stops the laptop poster BEFORE worker deploy; smoke test runs on a test brand in review mode with publisher=null; carephoto switched to autopilot+postiz only after smoke passes — prevents double-posting — cost: none.
- PF15 Ruling: migrate-sqlite uses an exact marker match (column/metadata, not LIKE on notes; marker not in agent-visible notes) and makes each table's import independently idempotent — cost: none.
- Task 3 Ruling: zonedTimeToUtc rewritten so ambiguous fall-back times map to the EARLIER instant and spring-gap times shift forward (pre-gap offset) — controller instruction; scheduled times (08/09/10:00) are never in the 02:00–03:00 band, so only edge cases affected — cost if wrong: a manual 02:xx time on switch days off by 1h.
- Task 4 Ruling (PF7 applied): recoverStaleRuns returns { requeued: number; failed: number; failedRuns: RunRow[] } (returning * instead of status); tests updated to assert failedRuns content — lets run loop email owner — cost: none.
- Task 4 Ruling (PF12 applied): getBrandNotifyEmails drops the role filter (all members) — spec "brand members" — cost: viewers emailed.
- Task 4 Ruling: apply 3 reviewer minors now via fix round (security-relevant, cheap): approvePost(db, brandId, id) with brand_id scope + cross-tenant test; parameterised RLS test over every tenant table (member-only SELECT, denied INSERT); hasCorePostOnLocalDate 22:30Z boundary test — overrides plan interface (approvePost had no prod caller) — cost: plan text for approvePost signature now stale; later tasks told.
- Task 4 Ruling: finishRun/heartbeatRun claim-guard (status='running' and attempts=$claimed) is carried into Task 11 dispatch — load-bearing for stalled-worker double-finish — cost: none.
- Task 9 Ruling: accept in-process per-brand lock for save_post duplicate guards; no DB-level uniqueness now — spec deploys ONE worker replica (concurrency 2, same process), so cross-process races need a concurrent CLI manual run for the same brand — cost if wrong: rare duplicate core post on one date; fix later with planned_local_date column + partial unique index.
- Task 9 Ruling: I1 (plan-mandated readImage arbitrary read/SSRF) — security overrides plan text; fix with shared image-source guard (allow-listed realpath roots; https-only public-IP URLs, manual redirects, timeout, byte cap, magic-byte type) applied to save_post AND brand-image.ts (same pattern) — cost: agent can no longer use http:// or arbitrary-path images.
- Task 9 Ruling: M2 (notification after save can throw) folded into fix round — wrap and report "saved; notification failed" — cost: none.
- Task 9 Ruling: M5 (system prompt "up to 3 posts/day, ship ≥2" vs guards 1 core/date + 1 timely/daily run) — do NOT edit protected creative guidance (GC + user memory on multi-post permission); briefs already state per-run limits; surface to user as product question at finish — cost: some rejected save_post attempts/iterations.
- Task 9 Ruling: round 2 will add (a) DNS-rebinding fix — validate resolved IP inside the connection's lookup (undici Agent connect.lookup / pinned IP), not a separate pre-check; (b) route photo-overlay.ts image reads/fetches through the same guard — same vuln class — cost: none.
- Task 11 Ruling: fold minors (heartbeat error log-once, guarded cleanup, agent-throw cleanup test) into fix round 1 with the Important unguarded terminal-failure email — cheap, same file — cost: none.
- Task 12 Ruling: fix round for 4 reviewer minors that risk wrong/duplicate posts: (a) publish OK but markPublished fails → retry once, then markFailed with "published as <id> but status update failed" + keep external id, email says do not repost; (b) per-post try/catch so a throwing markFailed can't strand the rest of the batch in 'publishing'; (c) Postiz publisher refuses posts whose brandId != env POSTIZ_BRAND_ID (single shared Postiz account = carephoto only); (d) schedule-post only probes tunnel when a local path is present — cost: none.
- Task 13 Ruling: fix round includes Important .dockerignore secret fix + ruled-in: non-root USER node with writable tmp, unhandledRejection/uncaughtException log-and-exit, shutdown drains in-flight runs (bounded ~25s) and db.end in try/finally — deploys otherwise burn run attempts — cost: none.
- Task 14: dispatched (BASE 1a2059c, implementer sonnet; PF15 ruling: posts.import_ref column + unique index instead of notes LIKE marker; per-table idempotency) Ruling cost: one extra migration column.
- Task 15: dispatched (BASE 317a396, implementer sonnet). Ruling: override pinned next 15.2.4/react 19.0.0 — later critical advisories (RSC RCE) — use newest patched stable ≥14d old, npm audit clean; anon key only in web; no open redirect — cost: plan's exact versions not used.
- Task 15 Ruling: accept supabase-js split (web 2.117.2 required by @supabase/ssr 0.12.7; core stays 2.49.4) — aligning core is a separate upgrade — cost: two supabase-js versions in tree.
- Task 15 Ruling: fold minors (exact proxy path match, NEXT_PUBLIC_SITE_URL for emailRedirectTo, gitignore next-env.d.ts) into fix round 1 with Critical open-redirect + Important cache headers/swallowed errors — cheap, same files — cost: none.
- Task 16 Ruling: amend my earlier cutover order — run migrate-sqlite BEFORE the autopilot flip (rows import as published, cannot republish; gives agent history context) — cost: none.
- Final Ruling: manual runs are CLI-only — worker claimNextRun excludes kind='manual'; CLI uses maxAttempts 1 (fail, never requeue); recoverStaleRuns fails stale manual runs directly — closes I2 + M10 without a schema change — cost: a crashed manual run must be re-run by hand.
- Final Ruling: fold safety minors M1 (window start ≥ now+15min), M2 (approved posts >6h overdue → expired, never published), M3 (paused brands: no claims/publishing), M4 (carousel_cover logo path via guard), M5 (send_notification falls back to OWNER_EMAIL), M6 (seed-brand doesn't overwrite approval_mode/publisher on conflict), M7 (runbook pauses demo brand after smoke), M8 (ingestMetrics POSTIZ_BRAND_ID guard) into the single fix wave — cost: none.
- Final: parked — missing third-party logo throws instead of omitting band — Ruling: agent gets a tool error and can retry; brand's own logo path unaffected — cost: occasional failed carousel_cover call.
- Final: parked — expireMissedApprovedPosts also expires approved posts of publisher=null brands after 6h (spec says they wait) — Ruling: accept for now, revisit in sub-project 2/3 (UI label) — cost: misleading 'missed publish window' on no-publisher brands.
- Final: parked — runbook late-Sunday first-plan should use next ISO week — Ruling: mention to user in handoff — cost: one manual re-run.

## Deferred minors (from task and final reviews)

- Task 1: minor (deferred): config/com.carephoto.hot-topics.plist points at old script path (scripts/ moved to apps/worker/scripts) — fix or drop at rollout (scraping moves into worker anyway)
- Task 1: minor (deferred): local .env must live in apps/worker/ (dotenv cwd) — tell user in handoff/runbook
- Task 1: minor (deferred): old `dev` script (--run-now) dropped; Task 13 CLI replaces it
- Task 2: minor (deferred): createPostgresDb untested (no-real-DB rule); postgres.js unsafe() simple vs extended protocol when params empty; PGlite instance not auto-closed
- Task 3: minor (deferred): mondayOfIsoWeek accepts W00/W54 silently; no year-boundary ISO tests (verified correct by reviewer); no input validation in zonedTimeToUtc
- Task 4: minor (deferred): is_brand_member search_path='public' not '' (all refs qualified)
- Task 5: minor (deferred): brand-config tests lack malformed-jsonb cases (branding w/o logoPath, competitors non-array); createSupabaseStorage error paths untested; zod .default({}) relies on zod 3 semantics (pinned 3.25.76)
- Task 6: minor (deferred): no failure-path test for materializeBrand (missing object → reject + no leftover dir); test uses shared os.tmpdir
- Task 6: minor (deferred, for sub-project 4): assets with same basename overwrite each other in temp dir (assetLocalPath uses basename) — upload UI must store unique file names
- Task 7: minor (deferred): insertCompetitorSnapshot lost its direct test (add to core repo.test); `flag-outlier` npm script points at unrunnable legacy script; post-performance no-data message shows raw UUID; no worker-level PGlite test for hot-topics/trending/scrape/ingest brand isolation
- Task 8: minor (deferred): no spring-forward (167h) weekly window test; daily brief test doesn't assert "save nothing"/no "publish"
- Task 9: minor (deferred): 3 legacy scripts call old runAgent signature (untypechecked); start log says "daily run" for all kinds
- Task 9: minor (deferred): M1 orphaned uploads on partial failure (needs sweeper); M3 timely cap skipped when runId null; M4 stale "next 7 days" empty text; M6 testCtx between imports/duplicated; M7 parallel timely test weak; M8 legacy scripts call old runAgent
- Task 9: minor (deferred): undici 8.x needs Node >=22.19 (Docker node:24 OK); guardedLookup ignores family hint for all:false
- Task 10: minor (deferred): skipLog Set grows ~2 keys/brand/day; brands created after a candidate time log spurious skip (could compare brand.created_at); no ISO year-boundary or exact-6h-edge scheduler tests; misnamed test "only fires the daily check on weekdays"; no RED run (process)
- Task 11: minor (deferred): manual runs get no userBrief from the run row (check when CLI builds manual runs); success-path finishRun DB error requeues and re-runs agent (relies on save_post guards)
- Task 12: minor (deferred): 'published' = accepted by Postiz (not IG media id); no sweep for posts stuck in 'publishing' after a crash; ingestMetrics passthrough untested; TDD order not followed (process)
- Task 12: minor (deferred): leftover `vi.importActual ... void real` noise in publish-loop test; POSTIZ_BRAND_ID must be set in worker env (runbook)
- Task 13: minor (deferred): 5 legacy scripts in apps/worker/scripts import deleted utils/detect-tunnel.js (untypechecked, already broken)
- Task 13: minor (deferred): POSTIZ_BRAND_ID validated in deps but publisher reads process.env directly; redundant `await p` in main.ts every(); image build + Chromium-as-node unverified until Railway
- Task 14: minor (deferred): toDate treats 'YYYY-MM-DDTHH:MM:SS' without zone as local; tests don't assert published_at/brand_id/UTC parsing; seed-brand not transactional; stale assets not removed on re-seed
- Task 15: minor (deferred, final review): npm audit shows vitest 3.2.4 dev chain (tinypool critical, vite high) — dev-only, pre-existing; consider vitest upgrade
- Task 16: minor (deferred): step 0 reject SQL runs before step 1 creates tables — add "after step 1" note
