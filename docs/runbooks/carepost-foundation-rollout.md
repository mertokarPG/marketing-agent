# Carepost foundation rollout (owner runbook)

This implements the plan's "carepost-foundation" runbook (Task 16); the file name differs from the plan's `docs/runbooks/carepost-foundation.md`.

Everything here is done by the owner. Nothing in this repo creates cloud resources or deploys by itself.
Tick the boxes as you go. **Order matters**: the cutover section (step 6) exists to prevent double-posting, and steps 1-5 are safe to do beforehand.

Where things live:

| Piece | Host | Config |
|---|---|---|
| Postgres, Auth, Storage | Supabase project `carepost` (EU Frankfurt) | `supabase/migrations/` |
| Web app (read-only drafts) | Vercel, Root Directory `apps/web` | `apps/web/.env.example` |
| Worker (agent, scheduler, publisher) | Railway, `Dockerfile` at the repo root | `apps/worker/.env.example` |

Key placement rule: the **service-role key lives only on the worker**. The web app gets only the public URL, anon key and site URL.

## 0. Stop the old laptop automation first (prevents double-posting)

- [ ] Stop any running local poster / cron / `npm start` from the old `marketing-agent` checkout.
- [ ] Unload the old hot-topics launchd job. It points at the old script path and is obsolete:
  ```bash
  launchctl unload ~/Library/LaunchAgents/com.carephoto.hot-topics.plist
  rm ~/Library/LaunchAgents/com.carephoto.hot-topics.plist
  launchctl list | grep carephoto   # expect no output
  ```
- [ ] **Clear legacy scheduled posts in Postiz.** The old `schedule-post` used type `schedule` for future dates, so posts may still be queued in Postiz after the laptop is stopped. The worker only knows its own `posts` table and will not see them, so both would publish. Open the Postiz calendar (week and month view, a few weeks ahead) and list every carephoto post already scheduled by the old system. For each one, do one of:
  - Delete it in Postiz (preferred), or
  - Note its date and leave that day unplanned: delete any worker draft for that local date (`update posts set status = 'rejected' where brand_id = (select id from brands where slug = 'carephoto') and status in ('pending_approval','scheduled') and (planned_at at time zone 'Europe/Brussels')::date = '<YYYY-MM-DD>';`) and do not run a weekly plan covering it until it has passed.
  Write the dates you found here: ______ . This is re-checked in step 8 right before autopilot.
- [ ] Keep `marketing-agent.db` (the old SQLite file); step 5 imports it.

## 1. Supabase

A **separate** project named `carepost`, in your existing org, region EU (Frankfurt, `eu-central-1`).
Note the free plan allows 2 active projects per org; pause or upgrade another one if creation is refused.

- [ ] Install and log in (interactive, opens a browser):
  ```bash
  brew install supabase/tap/supabase
  supabase login
  ```
- [ ] Create the project (pick your org id from `supabase orgs list`; the generated DB password goes into your password manager, not the repo; you need it for `DATABASE_URL`. If you prefer to see it, generate it first with `openssl rand -base64 24 | tr -d '/+='` and pass that string):
  ```bash
  supabase orgs list
  supabase projects create carepost --org-id <org-id> --region eu-central-1 \
    --db-password "$(openssl rand -base64 24 | tr -d '/+=')"   # print/copy it ONCE into a password manager; never commit it
  supabase projects list            # note the REFERENCE ID of carepost
  ```
  (Or create it in the dashboard; the rest is identical.)
- [ ] Link and apply every migration (foundation schema + RLS, storage buckets and policies, `posts_import_ref`):
  ```bash
  cd /path/to/marketing-agent-saas
  supabase link --project-ref <ref>
  supabase db push
  ```
- [ ] Verify: Dashboard -> Storage shows private buckets `brand-assets` and `post-media`; Table Editor shows `brands`, `posts`, `agent_runs`, `brand_members`, etc.
- [ ] Auth -> URL Configuration: set **Site URL** to the Vercel production URL (fill in after step 2) and add `<site-url>/auth/callback` to **Redirect URLs**. Add `http://localhost:3000/auth/callback` too for local dev.
- [ ] Collect values (Dashboard -> Project Settings):
  - `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`: API -> Project URL
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: API -> anon public key
  - `SUPABASE_SERVICE_ROLE_KEY`: API -> service_role key (secret, worker only)
  - `DATABASE_URL`: Database -> Connection string -> **Transaction pooler**, port **6543**, with your DB password filled in.
- [ ] Storage policies are **not** covered by the PGlite tests (they skip them), so verify them by hand after the smoke test in step 5: a brand member can create a signed URL for a `post-media` object of their brand, and a non-member cannot.

## 2. Web app (Vercel)

- [ ] Vercel -> Add New Project -> import this repo. **Root Directory: `apps/web`**.
- [ ] Environment variables (Production, plus Preview if you use it) - and nothing else:
  ```
  NEXT_PUBLIC_SUPABASE_URL=<project url>
  NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
  NEXT_PUBLIC_SITE_URL=https://<your-vercel-domain>
  ```
  Never add the service-role key here.
- [ ] Deploy. Go back to Supabase Auth and set Site URL / redirect to this domain (step 1).
- [ ] Open the site and sign in once with `okar.mert@gmail.com` (magic link). This creates your auth user, which seeding needs.

## 3. Local env for seeding and smoke runs

- [ ] Create `apps/worker/.env` on your laptop (the worker's cwd is `apps/worker`, so dotenv reads it there). Start from `apps/worker/.env.example` and fill at least `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `OWNER_EMAIL`, plus `FIRECRAWL_API_KEY`, `SMTP_*`, `CAREPHOTO_*` from your old `.env`. It is git-ignored.
- [ ] For local web dev only: `apps/web/.env.local` with the three `NEXT_PUBLIC_*` values.
- [ ] Install: `npm ci` at the repo root.

## 4. Seed brands (carephoto in review mode, plus a test brand)

`brands/carephoto/brand.json` says `autopilot` + `postiz`, and `seed-brand` upserts those onto the row. So seed, then immediately force the safe state before any worker exists:

- [ ] Seed carephoto (note the **UUID it prints**; it is the `POSTIZ_BRAND_ID` for step 6):
  ```bash
  cd apps/worker
  npm run seed-brand -- brands/carephoto okar.mert@gmail.com
  # -> seeded brand <carephoto-uuid>
  ```
- [ ] Put carephoto in the safe state (Dashboard -> SQL editor, or `psql "$DATABASE_URL"`):
  ```sql
  update brands set approval_mode = 'review', publisher = null where slug = 'carephoto';
  ```
  Do **not** re-run `seed-brand` for carephoto afterwards without redoing this, because it resets both columns from `brand.json`.
- [ ] Seed the throwaway test brand (fixture in review mode, no publisher, no image generation):
  ```bash
  npm run seed-brand -- tests/fixtures/seed-brand/demo okar.mert@gmail.com
  ```
- [ ] The web app now lists both `carephoto` and `demo`.

## 5. Smoke test (local, against the real Supabase, test brand only)

This uses your real `ANTHROPIC_API_KEY`. The test brand has no publisher, so nothing can be posted.

- [ ] Run a manual draft:
  ```bash
  cd apps/worker
  npm run agent -- --brand demo --kind manual --brief "Draft one test post for tomorrow."
  ```
  Expect a final row with `status: 'succeeded'`.
- [ ] In the web app, open the `demo` brand: the draft is there **with its images visible** (this exercises signed URLs through the storage policy).
- [ ] Non-member check (storage + RLS by hand): sign in to the web app with a second email that is not a member of any brand; it must see no brands and no drafts. Optionally, from that session, confirm a signed URL for `post-media/<demo-brand-uuid>/...` is refused.
- [ ] Clean up if you like: `update posts set status = 'rejected' where brand_id = (select id from brands where slug = 'demo');`
- [ ] Optional: `npm run agent -- --brand carephoto --kind manual` also works now, still draft-only because carephoto has `publisher = null`. Note: a carephoto draft created while `publisher = null` stays `pending_approval` after the autopilot flip in step 8. Reject it now (`update posts set status = 'rejected' where id = '<id>'`) or let it expire; never approve it later by accident, since it would then publish.

## 6. Worker (Railway) and cutover

- [ ] Railway -> New Project -> Deploy from GitHub repo -> this repo. In the service settings:
  - Builder: **Dockerfile**, path `Dockerfile` (it is at the repo root, `apps/worker` is *not* the build root: the build context must be the **repo root**, because the image copies `packages/core` and `supabase`).
  - **Replicas: 1.** Do not scale out: `save_post`'s duplicate guard is in-process.
- [ ] Service variables (copy values from your local `.env` where they exist; see `apps/worker/.env.example` for comments):
  ```
  DATABASE_URL            (transaction pooler, port 6543)
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  ANTHROPIC_API_KEY
  OWNER_EMAIL=okar.mert@gmail.com
  WORKER_CONCURRENCY=2
  CAREPHOTO_API_KEY
  CAREPHOTO_BASE_URL
  FIRECRAWL_API_KEY
  SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS
  POSTIZ_API_KEY
  POSTIZ_BASE_URL
  POSTIZ_BRAND_ID=<carephoto uuid printed in step 4>
  ```
  `PUPPETEER_*` are set by the Dockerfile. Do not set `POSTIZ_TUNNEL_URL` unless you still use the named tunnel.
- [ ] Deploy. **This is the first real Docker image build and Chromium launch** (it could not be tested locally), so verify:
  - Build succeeds (apt Chromium install, `npm ci`).
  - Deploy logs show `[worker] started (concurrency 2)` and no env errors (a missing variable is named in the error; values are never printed).
  - Prove Chromium works in the container: trigger a manual run for the test brand and confirm it renders a carousel (draft appears in the web app with slide images):
    ```bash
    railway link
    railway run --service <worker-service> -- npm run agent -- --brand demo --kind manual --brief "Draft one carousel test post."
    ```
    (`railway run` uses Railway's variables but executes on your laptop. To exercise the *container*, instead wait for the scheduled weekly/daily run for a brand, or open a Railway shell on the deployed service with `railway ssh` and run the same command there, then check logs for Puppeteer/Chromium errors.)

## 7. Import history from SQLite (before autopilot)

Imported rows have status `published`, so they can never be republished, and the agent then plans with past-post context. Idempotent, safe to re-run (re-runs report zeros). Needs the carephoto brand seeded (step 4).

- [ ] ```bash
  cd apps/worker
  npm run migrate-sqlite -- /path/to/old/marketing-agent.db carephoto
  ```
  It prints the imported counts. The web app shows carephoto with its history.

## 8. Enable carephoto autopilot (cutover)

- [ ] **Re-check the Postiz calendar** for old-system scheduled posts (step 0) once more; delete or work around any that remain.
- [ ] Only now enable carephoto autopilot. Prerequisites: step 0 done, steps 4, 5 and 7 clean, worker healthy, `POSTIZ_BRAND_ID` matches.
  ```sql
  update brands set approval_mode = 'autopilot', publisher = 'postiz' where slug = 'carephoto';
  ```
- [ ] Watch **one** publish end to end: the worker log shows `[publish] { published: 1 }`, the post appears on Instagram, the post row is `published` in the web app. If anything is off, revert immediately:
  ```sql
  update brands set approval_mode = 'review', publisher = null where slug = 'carephoto';
  ```
- [ ] After a week of correct posts, remove the `demo` brand if you do not want it listed.

## Known follow-ups

- **carephoto Agent API (lula PR)** must be deployed for `generate_image` / `referenceImages` to work; until then the Agent API only exists on the local carephoto dev server and prod `carephoto.art` has no `/api/v1/agent/*`. Image generation in worker runs will fail or be skipped until it ships. Set `CAREPHOTO_BASE_URL` accordingly.
- **Node >= 22.19** is required by the pinned `undici`; the Docker image uses Node 24. For local runs use Node 22.19+ or 24.
- **Dev-dependency audit advisories** (vitest toolchain) are known; they do not ship in the runtime image (`npm ci --omit=dev`). Revisit with a vitest upgrade.
- **Legacy scripts** in `apps/worker/scripts/` (everything except `seed-brand`, `migrate-sqlite`, `flag-outlier`) depended on SQLite or `schedule_post` and are no longer runnable or type-checked.
- Storage-policy behavior is verified manually (steps 1 and 5) because PGlite tests skip storage.
