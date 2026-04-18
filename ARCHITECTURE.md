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
                    │  (claude-sonnet-4-6, adaptive thinking) │
                    │  max 20 tool iterations      │
                    │  max_tokens: 16384 per turn  │
                    └──────────────┬──────────────┘
                                   │
               ┌───────────────────┼───────────────────┐
               │                   │                   │
        ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐
        │  Research    │    │  Content    │    │  Output     │
        │  Tools       │    │  Tools      │    │  Tools      │
        ├─────────────┤    ├─────────────┤    ├─────────────┤
        │scrape_       │    │get_recent_  │    │carousel_    │
        │ competitor   │    │ posts       │    │ cover       │
        │search_       │    │get_post_    │    │brand_image  │
        │ trends       │    │ performance │    │brand_       │
        │              │    │browse_      │    │ carousel    │
        │              │    │ prompt_bank │    │schedule_    │
        │              │    │ (dedup-aware)│    │ post        │
        │              │    │             │    │send_        │
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
2. Opens SQLite database (`marketing-agent.db`) — applies migrations + one-time backfill
3. Calls `runAgent(brand, db)`
4. On fatal error, sends email notification

## Orchestrator: `src/orchestrator.ts`

The core loop. Uses the Anthropic SDK's `toolRunner` which handles the multi-turn tool-use conversation automatically. The loop is iterated manually via `for await` so we can log each iteration's tool calls and stop reason — essential for observability when debugging agent behavior.

```
buildTools(brand, db)  →  array of Zod-typed tool definitions
buildSystemPrompt(brand)  →  detailed system prompt with strategy guidance
                              ↓
for await (msg of client.beta.messages.toolRunner({
  model: claude-sonnet-4-6,
  max_tokens: 16384,
  thinking: adaptive,
  tools: [...],
  max_iterations: 20
})) {
  log(iter, msg.stop_reason, msg.content.tool_uses)
}
```

`max_tokens: 16384` matters: at 4096 the model would sometimes exhaust budget on thinking+synthesis and never get to tool calls. 16384 gives adaptive thinking room to breathe.

### Tool registration is conditional:
- `browse_prompt_bank` — only if `brand.promptBankPath` is set
- `brand_image` / `brand_carousel` / `carousel_cover` — only if `brand.branding.enabled` is true

## Tools

### Research Tools

| Tool | File | External Service | Purpose |
|------|------|-----------------|---------|
| `scrape_competitor` | `scrape-competitor.ts` | Firecrawl API | Scrapes competitor websites, returns markdown (truncated to 3000 chars). Saves snapshot to DB. |
| `search_trends` | `search-trends.ts` | Firecrawl API | Searches web for trending topics related to keywords. Returns top 10 results. |

### Content/History Tools

| Tool | File | Storage | Purpose |
|------|------|---------|---------|
| `get_recent_posts` | `recent-posts.ts` | SQLite | Returns recent posts (prevents duplicate themes/captions). |
| `get_post_performance` | `post-performance.ts` | SQLite | Returns analytics to inform strategy. |
| `browse_prompt_bank` | `prompt-bank.ts` | JSON + SQLite | Browses prompt bank by category, **filters out already-used prompt IDs** based on `getUsedPromptIds(db, brandId)`. Used IDs are hidden from the agent entirely — dedup enforced at the tool layer, not left to the model. |

### Output Tools

| Tool | File | Engine | Purpose |
|------|------|--------|---------|
| `carousel_cover` | `carousel-cover.ts` | **Puppeteer + HTML template** | Renders editorial cover slide (slide 1 of a carousel) from a named template. Full CSS typography, font pairing, gradient backgrounds, decorative elements. Returns local PNG. |
| `brand_image` | `brand-image.ts` | **sharp + SVG** | Composites branding onto single image OR renders text-card slide (with optional grainy gradient base via puppeteer, composited back through sharp). Returns local PNG. |
| `brand_carousel` | `brand-image.ts` | **sharp** | Batch-brands multiple slides. DO NOT feed a `carousel_cover` output through this — already branded → double-branded. Use for pure photo or text-only carousels without a cover. |
| `schedule_post` | `schedule-post.ts` | Postiz API | Uploads images, schedules post. Requires `promptIds[]` so used images get tracked for dedup. |
| `send_notification` | `notify.ts` | SMTP | Sends email summary. Falls back to console.log. |

## Image Generation Engines

The project uses **two complementary image engines** chosen per use case:

### Engine A: Puppeteer + HTML/CSS (carousel_cover)

For editorial covers where typography + layout quality matter:

```
brands/<brand>/templates/<id>.html
  │  ← hand-crafted HTML with CSS variables + token placeholders
  │     (__HEADLINE__, __ACCENT_COLOR__, __BG_LAYER__, etc.)
  ▼
carousel-cover.ts
  │  - token substitutes slots + fonts (base64) + logos (base64)
  │  - renders gradient background via gradient.ts if mood requested
  │  - auto-picks mood-contrasting accent color via pickAccentForMood()
  ▼
Puppeteer (headless Chromium)
  │  - setViewport 1080x1350, DSR=1
  │  - setContent(html, {waitUntil: "networkidle0"})
  │  - page.screenshot({ type: "png", timeout: 20000 })
  │  - protocolTimeout: 30000  ← fail fast, don't hang 3 min on raster issues
  ▼
tmp/covers/<uuid>.png
```

Why this engine: CSS is the best typography engine that exists. Font pairing, blend modes, large decorative glyphs, curved text — all trivial. Templates are hand-crafted for visual quality; new templates are added by dropping an `.html` file in `brands/<brand>/templates/` and registering the id in the `carousel_cover` tool's `templateId` enum.

### Engine B: sharp + SVG (brand_image)

For body slides — photos with text overlays, or text cards on grainy gradient backgrounds:

```
Base image source (in priority order):
  1. URL/path → fetch + resize to 1080x1350 cover
  2. background=<mood> → renderGradientPng() via puppeteer (returns PNG buffer)
  3. backgroundColor=<hex> → flat color fallback
         │
         ▼
   Base PNG buffer (bgIsDark tracked for text contrast)
         │
    Composite layers via sharp:
         │
    ┌────▼────────────────────────────┐
    │ 1. Gradient scrim (SVG)         │  dark behind text for readability
    │    direction matches            │
    │    textPosition                 │
    ├─────────────────────────────────┤
    │ 2. Text overlay (SVG)           │  font via base64 @font-face,
    │    textColor adapts to bgIsDark │  white on dark / black on light
    ├─────────────────────────────────┤
    │ 3. Logo (PNG, 72×72, top-left)  │
    ├─────────────────────────────────┤
    │ 4. Page indicator (SVG pill)    │
    ├─────────────────────────────────┤
    │ 5. Swipe arrow (SVG, not last)  │
    ├─────────────────────────────────┤
    │ 6. Handle bar (SVG bottom)      │
    └─────────────────────────────────┘
         │
         ▼
   tmp/branded/<uuid>.png
```

Body slides can now share the same grainy gradient system as covers by setting `background: "sunset"` (or any mood). The gradient is rendered once via puppeteer and handed back as a PNG buffer to sharp — keeps the existing text/logo/handle compositing pipeline unchanged.

## Grainy Gradient System: `src/lib/gradient.ts`

Generates grain-textured mesh gradients used by both engines. 8 mood palettes, randomized blob positions per render, pre-baked PNG grain tile.

### Palette shape

```typescript
interface Palette {
  bg: string;          // base color behind the blobs
  blobs: string[];     // 2-5 colors for blurred color blobs
  grainOpacity: number; // 0.16 - 0.38 depending on base darkness
  blendMode?: "normal" | "screen" | "overlay" | "soft-light";
  accents: string[];   // high-contrast colors safe for headlines on this gradient
  isDark: boolean;     // used to auto-select text color
}
```

### Moods (current set)

| Mood | Vibe | Base | Accent pool |
|------|------|------|-------------|
| `aurora` | dark techy chromatic | `#0a0a1f` | warm yellow, mint, white |
| `sunset` | warm editorial | `#f5ebd9` | deep blue, forest, aubergine |
| `ocean` | cool professional | `#eaf4f7` | burgundy, amber, deep ink |
| `peach` | soft warm | `#fdeedc` | teal, indigo, rust |
| `noir` | dark moody vibrant | `#050510` | bright yellow, white, orange, mint |
| `mint` | soft calm wellness | `#f0fdf4` | rust, navy, berry |
| `duotone` | bold contrast | `#f5ead8` | forest, aubergine, black |
| `cobalt` | deep vibrant blue | `#050b24` | warm amber, white, orange, mint |

### Rendering: two blob layers + one binarized grain tile

```
<div bg: palette.bg overflow:hidden>
  <div blobs>
    <div 60-115% radial, blur(120-160px), opacity 0.85-1.0, mix-blend-mode: palette.blendMode>
    ... 2-5 of these, scattered across shuffled "zones"
  </div>
  <div grain coarse: data:image/png;base64,... size 800x800, overlay, opacity=g*0.55>
  <div grain fine:   data:image/png;base64,... size 240x240, overlay, opacity=g>
</div>
```

The grain tile is a **PNG generated at module load** (not SVG feTurbulence — Chromium anti-aliases SVG noise away). Pixel-pure random black/white/transparent pixels. `mix-blend-mode: overlay` darkens/brightens the gradient to produce the film-grain effect.

**Key gotcha:** the grain data URL uses **single quotes** inside `url('data:...')`. Double quotes collide with the outer `style="..."` attribute and silently break the CSS — a full debug loop of "why is grain invisible" traced to exactly this.

### Accent color picking

`pickAccentForMood(mood)` returns a color from `palette.accents` — guaranteed to contrast with the gradient. `carousel_cover` uses this when a mood is active, so accent words on sunset never pick orange, cobalt never picks blue, etc.

## Template System: Editorial Covers

Templates live in `brands/<brand>/templates/*.html`. Each is a self-contained HTML doc with:

- `@font-face` rules with `__FONT_*__` tokens (substituted with `file://` URLs at render time)
- Content slot tokens: `__HEADLINE__`, `__KICKER__`, `__SUBTITLE__`, `__ACCENT_COLOR__`, `__DECORATIVE_CHAR__`, `__STICKER__`, `__PAGE_INDICATOR__`, `__LOGO__`, `__IG_ICON__`, `__HANDLE__`
- Background slot: `__BG_LAYER__` (filled by gradient renderer or cream background)
- Theme slots: `__TEXT_COLOR__`, `__SUBTITLE_COLOR__`, `__LOGO_FILTER__`, `__PAGE_INDICATOR_BG__`, `__GRID__`, `__GRID_COLOR__`

### Current templates

| Template | Layout | Use for |
|----------|--------|---------|
| `headline-accent` | Kicker + big serif headline + italic-accent word + subtitle + optional decorative glyph + optional sticker bubble | Listicles, numbered hooks, statements, editorial covers |

### Adding a new template

1. Copy `headline-accent.html` to `brands/<brand>/templates/<new-id>.html`
2. Edit layout + CSS (keep all token placeholders the renderer substitutes)
3. Add the id to the `templateId` enum in `orchestrator.ts` (`carousel_cover` tool schema)
4. Tell the agent in the system prompt when to pick it

## Fonts

The carousel cover uses **Instrument Serif** (display, italic for accents) + **Geist** (sans, for kicker/subtitle/handle). Files in `brands/carephoto/assets/fonts/`:
- `InstrumentSerif-Regular.ttf`, `InstrumentSerif-Italic.ttf`
- `Geist-Regular.ttf`, `Geist-Bold.ttf`, `Geist-Black.ttf`

`brand_image` (sharp pipeline) uses **SF Old Republic** — declared in `brand.json.branding.fontPath`, embedded via base64 `@font-face` in the SVG overlay.

Two different fonts = two visual "types" on the feed. Expanding this means either adding template variants under `headline-accent`-style covers, or porting brand_image body slides to puppeteer with their own templates.

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
Records to DB: posts table (with source_images[]) + content_calendar
```

### Dedup tracking

`schedule_post` requires a `promptIds: string[]` parameter. The agent passes the prompt bank IDs it used. These are stored in `posts.source_images` (JSON array). On subsequent runs, `browse_prompt_bank` calls `getUsedPromptIds(db, brandId)` to filter out already-used IDs before showing the agent the catalog. The agent literally cannot pick a used prompt — it doesn't see them.

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
│    NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY=              │
│      ${POSTIZ_TUNNEL_URL}/uploads/                   │
│                                                      │
│  Cloudflared config (~/.cloudflared/config.yml):     │
│    tunnel: 1d217862-c806-4881-a6a5-208bc6cc06e8      │
│    ingress: postiz.mertokar.com → http://postiz:5000 │
│    credentials: /etc/cloudflared/<tunnel-id>.json    │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Note:** Postiz returns 200 on post creation even when Instagram delivery fails later. Check `state: "PUBLISHED"` via `GET /posts?startDate=...&endDate=...` to confirm actual delivery.

## Database: SQLite (`marketing-agent.db`)

Schema in `src/db/schema.ts`, queries in `src/db/queries.ts`.

```
posts
├── id, brand_id, caption, hashtags (JSON), image_url
├── posted_at, platform, external_post_id, content_theme
├── source_images (JSON array of prompt IDs) ← dedup key
└── created_at

analytics  (not yet populated — future work)
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

### Migration + backfill

`createDatabase()` runs idempotently on every startup:
1. `CREATE TABLE IF NOT EXISTS` for all tables
2. `ALTER TABLE posts ADD COLUMN source_images` if missing
3. Backfill: scan captions with `source_images = '[]'` for `prompt #<id>` references, populate

The backfill is best-effort — only single-image historical posts that mention the prompt ID in their caption get recovered. Carousel slides 2-N from the pre-tracking era are lost (acceptable limitation).

## Brand Configuration: `brands/<id>/brand.json`

Loaded by `src/config/load-brand.ts` with Zod validation.

```
brands/
  carephoto/
    brand.json
    assets/
      v4Logo_white_nobackground.png
      v4Logo_black_nobackground.png
      sf-old-republic.regular.ttf            ← used by brand_image
      instagram-logo-no-background.png
      fonts/
        InstrumentSerif-Regular.ttf           ← used by carousel_cover
        InstrumentSerif-Italic.ttf
        Geist-Regular.ttf
        Geist-Bold.ttf
        Geist-Black.ttf
    templates/
      headline-accent.html                    ← editorial cover template
```

Key config sections:
- **Core**: id, name, domain, niche, description, tone, keywords
- **Competitors**: array of {name, website, instagram?}
- **Posting**: frequency (daily/weekdays/custom), preferredTime
- **Branding** (optional): logo, font, IG icon, `accentPalette` (hex array for cover accents when no gradient is active), toggle for each overlay element
- **Carousel** (optional): frequency target (0.4 = 40%), min/max slides
- **Prompt bank** (optional): path to JSON file of existing AI-generated images

## System Prompt: `src/config/system-prompt.ts`

Dynamically built based on brand config. Includes:
- Brand identity and voice
- 5-step daily cycle instructions
- Output discipline rule (keep text between iterations short — synthesis happens in thinking, not prose)
- Content strategy rules (pillar rotation, dedup, performance-based weighting, emoji rules)
- Carousel vs single image decision guide (only if carousel config exists)
- Image branding + **carousel assembly** flow:
  - Cover = `carousel_cover` (final, do NOT re-brand)
  - Slides 2-N = individual `brand_image` calls with explicit `pageNumber`, each with a different gradient `background` mood
  - Never feed `carousel_cover` output through `brand_carousel` or `brand_image` → double-branding
- Prompt-bank tracking: agent MUST pass `promptIds[]` to `schedule_post` so dedup works

## Environment Variables

```
# Required
ANTHROPIC_API_KEY=         # Claude API
BRAND=carephoto            # Which brand config to load

# External services
FIRECRAWL_API_KEY=         # Web scraping + trend search
POSTIZ_API_KEY=            # Instagram scheduling
POSTIZ_BASE_URL=           # Default: https://app.postiz.com/api/public/v1
POSTIZ_TUNNEL_URL=         # Stable public URL for self-hosted Postiz (Cloudflare named tunnel)

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
| `sharp` | Image compositing (brand_image) |
| `puppeteer` | Headless Chromium for editorial rendering + gradient PNG generation |
| `node-cron` | Daily scheduling |
| `nodemailer` | Email notifications |
| `zod` | Schema validation (brand config + tool inputs) |
| `dotenv` | Environment variable loading |

## Posting Rules

- The agent may post up to **5 times per day** (configured in `system-prompt.ts`)
- Postiz `post_type` must always be `"post"` — carousels are posts with multiple images, not a separate type
- Postiz returns 200 on post creation even if Instagram delivery fails later — check `state: "PUBLISHED"` via `GET /posts` to confirm actual delivery

## What's Not Yet Built

1. **Image generation** — fal.ai integration or carephoto MCP server for generating new images dynamically (currently selects from a fixed prompt bank)
2. **Analytics ingestion** — Postiz analytics API (`GET /analytics/:integration`) not wired up; `analytics` table stays empty
3. **Dry-run mode** — no `--dry-run` flag to skip actual Postiz posting
4. **Concurrency limits** — parallel `brand_image` calls can stress puppeteer (5+ simultaneous renders occasionally time out). Agent auto-retries so non-blocking, but worth a semaphore later
5. **More editorial templates** — only `headline-accent` exists. Adding quote, stat-hero, question-card, split templates would give the feed more visual variety
