# Multi-Tenant Marketing Agent — Backend Architecture

Turning the local CLI marketing agent into a SaaS where any brand manager
can sign up, configure their brand, and let the agent run their Instagram.

The current app assumes **one user, one machine, files on disk, a Postiz
container next door**. Everything below is the work of removing those
assumptions while keeping the orchestrator logic (`src/orchestrator.ts`,
tools, design systems) essentially untouched.

---

## 1. Auth + tenancy

- User auth via **Clerk** or **Supabase Auth**.
- Data model:
  - `users` (1) → `brands` (N) — a user can own multiple brands.
  - Every downstream table gets a `brand_id` FK and Postgres RLS so a
    tenant can only see their own rows.
- A brand is the isolation unit, not the user — agencies managing 5 brands
  is a realistic shape.

## 2. Database (SQLite → Postgres)

Migrate the existing tables to Supabase or Neon with tenant scoping:

| Existing                | Change                                            |
| ----------------------- | ------------------------------------------------- |
| `posts`                 | add `brand_id`, RLS                               |
| `analytics`             | add `brand_id` via `posts` FK                     |
| `competitor_snapshots`  | add `brand_id`                                    |
| `content_calendar`      | add `brand_id`                                    |

Add new tables:

- **`brands`** — the `brand.json` shape as columns + a `jsonb` blob for
  the loose fields (tone, description, keywords). Schema mirrors
  `BrandConfigSchema` in `src/config/load-brand.ts`.
- **`brand_assets`** — `(brand_id, kind, url)` for uploaded logo, font,
  instagram icon. `kind` ∈ `logo | font | icon`.
- **`prompt_bank_entries`** — replaces the local JSON file at
  `promptBankPath`. Columns: `id`, `brand_id`, `prompt_id`, `image_url`,
  `metadata jsonb`, `used_at`.
- **`social_accounts`** — per-brand Instagram credentials (Postiz org
  handle or OAuth tokens, depending on path chosen in §5).
- **`usage_events`** — per-tenant Claude tokens, fal.ai images, Postiz
  posts. Billing + abuse detection.
- **`agent_runs`** — one row per orchestrator invocation: brand_id,
  started_at, finished_at, status, cost, scheduled_post_id.

## 3. Object storage

Logos, fonts, instagram icons, and generated carousel PNGs can't live on
a filesystem in a multi-tenant world.

- **Vercel Blob** or **Supabase Storage** for user uploads.
- `logoPath`, `fontPath`, `instagramIconPath` all become URLs.
- Generated slides: write the Puppeteer/React screenshot output to Blob
  and hand Postiz a public URL (removes the Cloudflare tunnel hack in
  `schedule-post.ts:119` that rewrites localhost → tunnel URL).

## 4. Scheduler + worker (the hard part)

The agent can't depend on the user's laptop being awake. A full run is
30–120s of Claude + fal.ai + Puppeteer work.

**Recommended: Inngest or Trigger.dev.**
- Durable step functions — research → generate slides → schedule →
  ingest analytics, each step is retriable and crash-safe.
- Per-brand cron triggers driven by `brands.posting_schedule`.
- Built-in observability (step logs, retries, failed job replay).
- Handles the "run every day at 10:00" need without raw cron + worker
  glue.

Alternatives:
- **Vercel Workflow (WDK)** — nice if you stay all-Vercel, similar shape.
- **Temporal** — overkill at this stage but a natural graduation path.
- **Raw cron + a worker on Fly/Railway** — cheapest but you rebuild the
  retry/visibility layer yourself.

**Avoid**: plain Vercel serverless functions — 10s default timeout,
60s max, your run will die mid-render.

## 5. Social publishing

Two viable paths, pick based on MVP timeline:

### Path A: keep Postiz (fast to ship)
- Run one Postiz instance, use its built-in orgs/teams model.
- Each user gets an org; store their Postiz API key in `social_accounts`.
- Pros: reuse of `src/tools/schedule-post.ts`, `ingest-analytics.ts`,
  and the caption/media upload pipeline as-is.
- Cons: Postiz is a dependency with its own quirks (see the
  `upload-from-url` / tunnel-URL rewrite dance).

### Path B: direct Instagram Graph API (own the stack)
- OAuth flow per brand to connect their IG Business account.
- Store long-lived tokens in `social_accounts`, refresh on schedule.
- Replace Postiz calls with Graph API publish + insights.
- Pros: no middle-man, full control, better error visibility.
- Cons: requires Meta App Review, token refresh logic, per-platform
  adapters when you expand beyond IG.

**Recommendation**: ship Path A, migrate to Path B once product-market
fit is clear.

## 6. API layer

- **Next.js App Router** on Vercel with route handlers (or tRPC if you
  want end-to-end types).
- CRUD for the brand form (the one you're designing with claude/design).
- `POST /api/brands/:id/run` — trigger an immediate agent run (enqueues
  an Inngest job, returns `agent_run_id`).
- `GET /api/brands/:id/runs` — list recent runs with status for the
  dashboard activity feed.
- Webhook endpoints: Postiz delivery confirmations (IG actually posted
  vs. Postiz just queued it — closes the backlog's
  "delivery verification" gap).

## 7. Usage metering + billing

Every post run is real money: Claude Opus tokens + 2–10 fal.ai image
calls + Puppeteer/React compute. Roughly $0.10–$0.50 per post.

- Log `usage_events` at the tool-call level.
- **Stripe** for subscriptions (e.g. $49/mo = 1 brand, 1 post/day) or
  metered billing ($/post).
- Soft-cap free tier: block the Inngest trigger if monthly budget
  exceeded.

## 8. Secrets

Per-tenant secrets (Postiz API key or IG tokens, optional user-provided
Anthropic/fal keys if you do BYOK) must NOT live in env vars.

- Store encrypted in Postgres (pgcrypto) or a secrets service
  (Doppler, Infisical, AWS Secrets Manager).
- Worker fetches + decrypts per run.

## 9. Assets & design-systems

The 13 design systems in `design-systems/` stay in-repo — they're app
code, not tenant data. The brand form in §6 just lets a tenant pick one.

Fonts and logos the tenant uploads are the only per-tenant binary
assets — those go to Blob storage (§3).

## 10. Observability

- **Logs**: Inngest UI + structured logs to Axiom or Baselime, scoped
  by `brand_id`.
- **Dashboard**: per-brand "activity feed" of runs + scheduled posts +
  published URLs + errors.
- **Alerts**: Slack/email webhook on failed runs or Postiz 5xx rate
  spike.

---

## Recommended MVP stack

| Layer              | Choice                                        |
| ------------------ | --------------------------------------------- |
| Hosting            | Vercel (Next.js App Router)                   |
| Auth               | Clerk                                         |
| DB                 | Supabase Postgres (+ RLS + Storage)           |
| Object storage     | Supabase Storage or Vercel Blob               |
| Workers / cron     | Inngest                                       |
| Social publishing  | Postiz (Path A) → Graph API (Path B later)    |
| Billing            | Stripe                                        |
| Observability      | Axiom + Inngest run history                   |

---

## Open questions / decisions

1. **BYOK or hosted keys?** Charging a flat $/post with your own
   Anthropic + fal keys is simpler UX. BYOK means users bring their
   Anthropic/fal keys and you charge a platform fee — lower margin risk
   but more onboarding friction.
2. **One post/day cap per brand or unlimited?** Current agent allows
   up to 5/day. Pricing anchor matters.
3. **Multi-platform?** Postiz already supports LinkedIn, X, Threads,
   TikTok — the agent logic is IG-specific today (caption style,
   hashtag rules). Expanding is a content-strategy refactor, not a
   backend one.
4. **Agency mode?** If agencies managing many brands are a real segment,
   add `organizations` above `users` and make brands org-owned.

---

## What does NOT change

The core orchestrator is already cleanly separated:

- `src/orchestrator.ts` — runs Claude with a tool set, brand-scoped.
- `src/tools/*` — all take a `BrandConfig` + a DB handle.
- `src/config/load-brand.ts`, `load-design-system.ts` — config loaders.

Multi-tenancy is a swap of "load brand from a JSON file on disk" to
"load brand from Postgres scoped by auth" and a swap of "local SQLite"
to "shared Postgres with RLS." The agent's actual behavior is
unchanged.
