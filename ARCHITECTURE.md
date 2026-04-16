# Marketing Agent Architecture

## Overview

An autonomous marketing agent that runs a daily cycle: research competitors & trends, review past performance, decide on content strategy, generate branded images, schedule posts to Instagram via Postiz, and send a summary notification.

Built with TypeScript. The "brain" is Claude (via Anthropic SDK `toolRunner`), which orchestrates the entire cycle by calling tools in a loop.

```
                        ┌─────────────────────┐
                        │     index.ts         │
                        │  (cron or --run-now) │
                        └──────────┬──────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │       orchestrator.ts        │
                    │                              │
                    │  Claude toolRunner loop      │
                    │  (claude-sonnet-4-6 + thinking) │
                    │  max 20 tool iterations      │
                    └──────────────┬──────────────┘
                                   │
               ┌───────────────────┼───────────────────┐
               │                   │                   │
        ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐
        │  Research    │    │  Content    │    │  Output     │
        │  Tools       │    │  Tools      │    │  Tools      │
        ├─────────────┤    ├─────────────┤    ├─────────────┤
        │scrape_       │    │get_recent_  │    │schedule_    │
        │ competitor   │    │ posts       │    │ post        │
        │search_       │    │get_post_    │    │brand_image  │
        │ trends       │    │ performance │    │brand_       │
        │              │    │browse_      │    │ carousel    │
        │              │    │ prompt_bank │    │send_        │
        │              │    │             │    │ notification│
        └──────┬──────┘    └──────┬──────┘    └──────┬──────┘
               │                  │                   │
        ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐
        │  Firecrawl  │    │  SQLite DB  │    │  Postiz API │
        │  API        │    │             │    │  + Tunnel   │
        └─────────────┘    └─────────────┘    └─────────────┘
```

## Entry Point: `src/index.ts`

Two modes:
- **Cron mode** (default): `npm start` — schedules `dailyRun()` at 07:00 daily via `node-cron`
- **Immediate mode**: `npm run dev` / `--run-now` — runs once immediately

Each run:
1. Loads brand config from `brands/<BRAND>/brand.json`
2. Opens SQLite database (`marketing-agent.db`)
3. Calls `runAgent(brand, db)`
4. On fatal error, sends email notification

## Orchestrator: `src/orchestrator.ts`

The core loop. Uses the Anthropic SDK's `toolRunner` which handles the multi-turn tool-use conversation automatically.

```
buildTools(brand, db)  →  array of Zod-typed tool definitions
buildSystemPrompt(brand)  →  detailed system prompt with strategy guidance
                              ↓
client.beta.messages.toolRunner({
  model: claude-sonnet-4-6,
  thinking: adaptive,
  tools: [...],
  max_iterations: 20
})
```

Claude receives a single user message ("Run the daily marketing cycle...") and autonomously decides which tools to call and in what order. The SDK handles the tool_use → tool_result loop.

### Tool registration is conditional:
- `browse_prompt_bank` — only if `brand.promptBankPath` is set
- `brand_image` / `brand_carousel` — only if `brand.branding.enabled` is true

## Tools

### Research Tools

| Tool | File | External Service | Purpose |
|------|------|-----------------|---------|
| `scrape_competitor` | `scrape-competitor.ts` | Firecrawl API | Scrapes competitor websites, returns markdown (truncated to 3000 chars). Saves snapshot to DB. |
| `search_trends` | `search-trends.ts` | Firecrawl API | Searches web for trending topics related to keywords. Returns top 10 results. |

### Content/History Tools

| Tool | File | Storage | Purpose |
|------|------|---------|---------|
| `get_recent_posts` | `recent-posts.ts` | SQLite | Returns recent posts for the brand (prevents duplicate content). |
| `get_post_performance` | `post-performance.ts` | SQLite | Returns analytics (likes, comments, reach, etc.) to inform strategy. |
| `browse_prompt_bank` | `prompt-bank.ts` | JSON file | Browses carephoto's existing AI-generated images by category. The agent selects images from here for posts. |

### Output Tools

| Tool | File | External Service | Purpose |
|------|------|-----------------|---------|
| `brand_image` | `brand-image.ts` | sharp (local) | Composites branding overlays onto a single image. Returns local file path. |
| `brand_carousel` | `brand-image.ts` | sharp (local) | Brands multiple slides with auto page numbering + swipe arrows. Returns array of local paths. |
| `schedule_post` | `schedule-post.ts` | Postiz API | Uploads images and schedules the post to Instagram. Handles both URLs and local files. |
| `send_notification` | `notify.ts` | SMTP (nodemailer) | Sends email summary to brand owner. Falls back to console.log if SMTP not configured. |

## Image Branding Pipeline: `src/tools/brand-image.ts`

All compositing uses `sharp`. Images are 1080x1350 (Instagram portrait ratio).

```
Source image (URL or local)  ──or──  Solid color background
         │                                    │
         ▼                                    ▼
   sharp.resize(1080x1350, cover)    sharp.create(1080x1350)
         │                                    │
         └──────────────┬─────────────────────┘
                        ▼
              Base PNG buffer
                        │
          Composite layers (in order):
                        │
         ┌──────────────▼──────────────┐
         │  1. Gradient scrim (SVG)    │  ← dark gradient behind text area
         │     direction matches       │     for readability on any bg
         │     textPosition            │
         ├─────────────────────────────┤
         │  2. Text overlay (SVG)      │  ← custom font via base64 @font-face
         │     with drop shadow filter │     isThumbnail = larger/bolder
         ├─────────────────────────────┤
         │  3. Logo (PNG)              │  ← top-left corner, 72x72
         ├─────────────────────────────┤
         │  4. Page indicator (SVG)    │  ← "2/5" pill, top-right
         ├─────────────────────────────┤
         │  5. Swipe arrow (SVG)       │  ← "›" circle, right edge
         │     (not on last slide)     │
         ├─────────────────────────────┤
         │  6. Handle bar (SVG)        │  ← "@handle" bar, bottom
         │     with IG icon            │
         └─────────────────────────────┘
                        │
                        ▼
              tmp/branded/<uuid>.png
```

### Gradient scrim details:
- `textPosition: "top"` → linear gradient from top (0.7 opacity) fading to transparent at 60%
- `textPosition: "bottom"` → linear gradient from bottom (0.7 opacity) fading up to transparent at 60%
- `textPosition: "center"` → radial gradient, transparent center, 0.5 opacity edges (vignette)

## Posting Pipeline: `src/tools/schedule-post.ts`

```
input.images[]
      │
      ├── URL (http/https)  →  uploadImageFromUrl()  →  POST /upload-from-url
      │                        keeps original URL as path (Instagram fetches this)
      │
      └── Local path         →  uploadImageFile()     →  POST /upload (multipart)
                                rewrites localhost path to POSTIZ_TUNNEL_URL
                                so Instagram can reach it
      │
      ▼
POST /posts  →  Postiz schedules to Instagram
      │
      ▼
Records to DB: posts table + content_calendar
```

### Postiz Infrastructure (Docker)

```
┌──────────────────────────────────────────────────────┐
│  docker-compose.yml  (/Users/mertokar/postiz/)       │
├──────────────────────────────────────────────────────┤
│                                                      │
│  postiz (port 8888→5000)                             │
│    ├── postgres (postiz-db)                          │
│    ├── redis (postiz-redis)                          │
│    ├── temporal + temporal-init                       │
│    └── cloudflared (named tunnel)                    │
│         └── exposes postiz:5000 publicly             │
│             via postiz.mertokar.com                  │
│                                                      │
│  Key env vars (.env):                                │
│    POSTIZ_TUNNEL_URL=https://postiz.mertokar.com     │
│    UPLOAD_DIRECTORY=/uploads/                        │
│    NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY=               │
│      ${POSTIZ_TUNNEL_URL}/uploads/                   │
│                                                      │
│  Cloudflared config (~/.cloudflared/config.yml):     │
│    tunnel: 1d217862-c806-4881-a6a5-208bc6cc06e8     │
│    ingress: postiz.mertokar.com → http://postiz:5000 │
│    credentials: /etc/cloudflared/<tunnel-id>.json    │
│                                                      │
└──────────────────────────────────────────────────────┘
```

The named Cloudflare tunnel gives uploaded images a **stable public URL** (`postiz.mertokar.com`) that Instagram can fetch. Unlike quick tunnels (`*.trycloudflare.com`) which change URL on every restart and crash-loop silently, the named tunnel has a fixed domain backed by DNS (CNAME on `mertokar.com`).

The tunnel runs inside Docker (mounts `~/.cloudflared` for credentials + config) and routes traffic directly to `postiz:5000` on the Docker network.

`POSTIZ_TUNNEL_URL` is set in both:
- `/Users/mertokar/postiz/.env` — so Postiz rewrites upload paths
- `/Users/mertokar/Documents/GitHub/marketing-agent/.env` — so the agent rewrites localhost paths when uploading local files

The `detectTunnelUrl()` fallback in `src/utils/detect-tunnel.ts` still works for quick tunnels if needed, but with `POSTIZ_TUNNEL_URL` set explicitly it's skipped.

**Note:** Postiz returns 200 on post creation even when Instagram delivery fails later. Check `state: "PUBLISHED"` via `GET /posts?startDate=...&endDate=...` to confirm actual delivery.

## Database: SQLite (`marketing-agent.db`)

Schema in `src/db/schema.ts`, queries in `src/db/queries.ts`.

```
posts
├── id, brand_id, caption, hashtags (JSON), image_url
├── posted_at, platform, external_post_id, content_theme
└── created_at

analytics
├── id, post_id (FK→posts), brand_id
├── likes, comments, shares, reach, impressions
├── profile_visits, link_clicks
└── measured_at

competitor_snapshots
├── id, brand_id, competitor_name
├── content_summary, engagement_notes
└── scraped_at

content_calendar
├── id, brand_id, planned_date, theme
├── caption_draft, hashtags (JSON), status, reasoning
└── created_at
```

## Brand Configuration: `brands/<id>/brand.json`

Loaded by `src/config/load-brand.ts` with Zod validation.

```
brands/
  carephoto/
    brand.json          ← main config
    assets/
      v4Logo_white_nobackground.png
      v4Logo_black_nobackground.png
      sf-old-republic.regular.ttf
      instagram-logo-no-background.png
```

Key config sections:
- **Core**: id, name, domain, niche, description, tone, keywords
- **Competitors**: array of {name, website, instagram?}
- **Posting**: frequency (daily/weekdays/custom), preferredTime
- **Branding** (optional): logo, font, IG icon, toggle for each overlay element
- **Carousel** (optional): frequency target (0.4 = 40%), min/max slides
- **Prompt bank** (optional): path to JSON file of existing AI-generated images

## System Prompt: `src/config/system-prompt.ts`

Dynamically built based on brand config. Includes:
- Brand identity and voice
- 5-step daily cycle instructions
- Content strategy rules (pillar rotation, dedup, performance-based weighting)
- Carousel vs single image decision guide (only if carousel config exists)
- Image branding instructions + thumbnail strategy (only if branding enabled)

## Environment Variables

```
# Required
ANTHROPIC_API_KEY=         # Claude API
BRAND=carephoto            # Which brand config to load

# External services
FIRECRAWL_API_KEY=         # Web scraping + trend search
POSTIZ_API_KEY=            # Instagram scheduling
POSTIZ_BASE_URL=           # Default: https://app.postiz.com/api/public/v1
# POSTIZ_TUNNEL_URL=       # Auto-detected from Docker logs. Set manually to override.

# Notifications (optional — falls back to console.log)
NOTIFY_EMAIL=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `@anthropic-ai/sdk` | Claude API + toolRunner loop |
| `@mendable/firecrawl-js` | Web scraping + search |
| `better-sqlite3` | Local database |
| `sharp` | Image compositing |
| `node-cron` | Daily scheduling |
| `nodemailer` | Email notifications |
| `zod` | Schema validation (brand config + tool inputs) |
| `dotenv` | Environment variable loading |

## Posting Rules

- The agent may post up to **5 times per day** (configured in `system-prompt.ts`)
- Postiz `post_type` must always be `"post"` — carousels are posts with multiple images, not a separate type
- Postiz returns 200 on post creation even if Instagram delivery fails later — check `state: "PUBLISHED"` via `GET /posts` to confirm actual delivery

## What's Not Yet Built

1. **Image generation** — fal.ai integration for generating images (currently uses prompt bank of existing images)
2. **Analytics ingestion** — Postiz analytics API (`GET /analytics/:integration`) not yet wired up to populate the `analytics` table
3. **Dry-run mode** — no `--dry-run` flag to skip actual Postiz posting
4. ~~**Named Cloudflare tunnel**~~ — Done (2026-04-16). Using `postiz.mertokar.com` via named tunnel in Docker
