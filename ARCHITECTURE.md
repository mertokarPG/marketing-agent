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
        │get_trending_│    │get_recent_  │    │carousel_    │
        │ topics      │    │ posts       │    │ cover       │
        │get_hot_     │    │get_post_    │    │body_slide   │
        │ topics      │    │ performance │    │photo_overlay│
        │get_brand_   │    │browse_      │    │brand_image  │
        │ logo        │    │ prompt_bank │    │brand_       │
        │scrape_      │    │ (dedup-aware)│    │ carousel    │
        │ competitor  │    │             │    │schedule_    │
        │search_      │    │             │    │ post        │
        │ trends      │    │             │    │send_        │
        │             │    │             │    │ notification│
        └──────┬──────┘    └──────┬──────┘    └──────┬──────┘
               │                  │                   │
     ┌─────────▼──────────┐  ┌───▼─────┐       ┌──────▼──────┐
     │  trends DB         │  │ SQLite  │       │ Postiz API  │
     │  (nightly scrape + │  │         │       │ + Cloudflare│
     │   Claude Haiku     │  └─────────┘       │ named tunnel│
     │   clustering)      │                    │ + catbox    │
     │ Brandfetch API     │                    │ fallback    │
     │ Firecrawl API      │                    └─────────────┘
     └────────────────────┘
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
- `brand_image` / `brand_carousel` — only if `brand.branding.enabled` is true (engine-agnostic, sharp-based)
- `carousel_cover` / `body_slide` / `photo_overlay` — only if `brand.branding.enabled` is true AND the active design system is `engine: "html-tokens"`. For these, the template-id enums and per-kind slot schemas are derived at tool-build time from the loaded design-system manifest.
- For `engine: "react-jsx"` design systems, `carousel_cover` and `body_slide` are registered with different schemas (discriminated union per slide kind) that mirror the JSX renderer's slot shape.
- `compose_image_prompt` / `generate_image` — only if `brand.imageGeneration.enabled` is true. Both gate together — the system prompt makes `compose_image_prompt` a required preflight for `generate_image`, so they're useless apart.

## Tools

### Research Tools

| Tool | File | External Service | Purpose |
|------|------|-----------------|---------|
| `get_trending_topics` | `trending-topics.ts` | Claude Haiku 4.5 | **Step 1 of every cycle.** Reads the `trends` table, clusters items into real cross-source topics (not single viral posts), ranks by source diversity + relevance to the brand (driven by `brand.hotTopics.relevantThemes`). Returns labeled `high / medium / low` relevance. |
| `get_hot_topics` | `hot-topics.ts` | SQLite | Raw per-post view of the `trends` table, ranked by velocity = score / source_p90_baseline. Secondary drill-down after `get_trending_topics` clusters a topic; good for pulling specific citations inside a cluster. |
| `get_brand_logo` | `brand-logo.ts` | Brandfetch API + Google favicon fallback | Fetches a third-party brand's logo (wordmark / symbol / icon, light or dark theme) as a local PNG. Caches to `tmp/brand-logos/<slug>.png`. Used for trend-reaction covers referencing named brands (OpenAI, Midjourney, Figma, etc.). |
| `scrape_competitor` | `scrape-competitor.ts` | Firecrawl API | Scrapes competitor websites, returns markdown (truncated to 3000 chars). Saves snapshot to DB. |
| `search_trends` | `search-trends.ts` | Firecrawl API | Searches web for trending topics related to keywords. Fallback / ad-hoc dig — `get_trending_topics` is the primary push-based signal. |

### Hot-topics pipeline (push-based trend discovery)

```
  Brand sources                                   Agent cycle
  ─────────────                                   ───────────
  brands/<id>/hot-topics-sources.json
  (RSS / HN / Reddit / firecrawl-search)
           │
           ▼
  scrape-hot-topics.ts  (runs at start of every runAgent,
                          concurrency=4, dedupes by URL)
           │
           ▼
     trends table (SQLite)  ◄── every agent cycle starts by
     id, source_id, category,     refreshing this table
     title, url, summary, score,
     published_at, fetched_at
           │
           ▼
  get_trending_topics(brand, lookback_hours)      ←  AGENT STEP 1
     │
     │  Claude Haiku 4.5 structured output
     │  clusters into "real topics covered by ≥2 sources"
     │  filters single-source anecdotes (funny Reddit posts, etc.)
     │  tags each cluster as relevance=high|medium|low
     │  against brand.hotTopics.relevantThemes
     │
     ▼
  Top clusters returned, ranked by:
     1. relevance (high > medium > low)
     2. source breadth (more distinct sources = stronger signal)
```

**Why a clustering pass?** Raw per-post ranking surfaces noise — one viral anecdote from r/photography doesn't mean the photography world is *talking about it*. Real topics have cross-source coverage (HN + Reddit + trade press all hitting the same story). Haiku is the cheapest model that can read 500+ items and do this grouping accurately. ~$0.02 per cycle.

**Per-brand sources (multi-tenant).** Each brand has its own `brands/<id>/hot-topics-sources.json` — carephoto pulls AI/design/photography feeds, a hypothetical skincare brand would pull Allure + r/SkincareAddiction + Byrdie. `brand.hotTopics.relevantThemes` is injected into the Haiku system prompt so relevance scoring is brand-aware.

`get_hot_topics` remains available as a raw per-post drilldown — the agent can use it after `get_trending_topics` to pull the specific Reddit/HN/RSS items inside a cluster.

### Brand-logo fetching

`get_brand_logo({ brand, variant, theme })` resolves third-party brand logos:

```
Input: "OpenAI" or "openai.com", variant ∈ {logo,symbol,icon}, theme ∈ {dark,light}
    │
    ▼
  normalize domain  (strip protocol, www., lowercase)
    │
    ▼
  if no dot in input → Brandfetch /v2/search (rank by qualityScore → resolve domain)
    │
    ▼
  Brandfetch /v2/brands/<domain>
    │  pick logo matching variant/theme (fallback ladder if exact miss)
    │  pick format: prefer largest PNG/WebP (SVGs from Brandfetch are often
    │               Illustrator exports with broken xmlns that librsvg rejects)
    ▼
  sharp rasterize → 1024px PNG
    │
    ▼
  cached at tmp/brand-logos/<slug>__<variant>__<theme>.png
```

**Fallback:** if Brandfetch 404s or returns no logos, falls back to `https://www.google.com/s2/favicons?domain=<domain>&sz=256` (no auth, always works, lower quality). Variant downgrades to `icon` in that case.

**Theme match rule** (enforced in system prompt): dark slide backgrounds → request `theme='light'` (light-colored logo); light backgrounds → request `theme='dark'`. Otherwise the logo invisibly blends in.

**Integration with covers:** `carousel_cover` accepts an optional `brandLogoPath` slot. When set on a template that includes the `__BRAND_LOGO__` token (currently `dark-hero-cover`), the logo renders above the headline with an accent rule as visual anchor. Other templates ignore the slot.

### Content/History Tools

| Tool | File | Storage | Purpose |
|------|------|---------|---------|
| `get_recent_posts` | `recent-posts.ts` | SQLite | Returns recent posts (prevents duplicate themes/captions). |
| `get_post_performance` | `post-performance.ts` | SQLite | Returns analytics to inform strategy. |
| `browse_prompt_bank` | `prompt-bank.ts` | JSON + SQLite | Browses prompt bank by category, **filters out already-used prompt IDs** based on `getUsedPromptIds(db, brandId)`. Used IDs are hidden from the agent entirely — dedup enforced at the tool layer, not left to the model. |

### Output Tools

| Tool | File | Engine | Purpose |
|------|------|--------|---------|
| `carousel_cover` | `carousel-cover.ts` (html-tokens) / `react-slide.ts` (react-jsx) | **Puppeteer + HTML/token template** OR **Puppeteer + React/Babel + JSX** | Renders slide 1 of a carousel. Schema varies per engine — html-tokens exposes rich slots (headline, kicker, decorativeChar, stickerText, background); react-jsx exposes the cover-kind slots (eyebrow, kicker, title, subtitle, cta) plus mode/markVariant/accentColor. |
| `body_slide` | `carousel-cover.ts` (html-tokens) / `react-slide.ts` (react-jsx) | Same engines as carousel_cover | html-tokens: picks a `body-*` template and reuses the cover renderer. react-jsx: discriminated union over slide kinds `intro / numbered / stat / list / cta`, each with its own slot shape. |
| `photo_overlay` | `photo-overlay.ts` | **Puppeteer + HTML/token template** | Composites editorial text onto a source photo via a `photo-*` template. Only registered for html-tokens systems that ship photo templates. |
| `brand_image` | `brand-image.ts` | **sharp + SVG** | Composites branding onto a single image OR renders a text-card slide (with optional grainy gradient base). Engine-agnostic. |
| `brand_carousel` | `brand-image.ts` | **sharp** | Batch-brands multiple slides. DO NOT feed a rendered cover/body/photo-overlay output through this — already branded → double-branded. Use for pure photo or text-only carousels without a cover. |
| `compose_image_prompt` | `compose-image-prompt.ts` | **Anthropic Haiku 4.5** | REQUIRED preflight before every `generate_image`. Takes `{postContext, visualStyle, mustInclude?, aspectRatio?}`, returns `{prompt, recommendedModel, rationale}`. Bans AI-cliché tokens (`"creative woman"`, `"studio workspace"`, `"film grain"`, `"cinematic"`, etc.), requires named subject + props + location + light + composition, picks the right model from the 7 available. ~$0.001/call. See Engine D below. |
| `generate_image` | `generate-image.ts` | **carephoto Agent API** (`POST /api/v1/agent/generate`) | Generates a brand-styled photo from a text prompt. Returns a public Supabase URL + cost metadata. Uses `prompt` and `model` fields verbatim from `compose_image_prompt`'s output. ~$0.04–$0.15 per call depending on model. See Engine D. |
| `schedule_post` | `schedule-post.ts` | Postiz API | Uploads images, schedules post. Requires `promptIds[]` so used images get tracked for dedup. |
| `send_notification` | `notify.ts` | SMTP | Sends email summary. Falls back to console.log. |

## Design Systems

Templates, fonts, and palettes are grouped into **design systems** under `design-systems/<id>/`. A brand picks one via `"designSystem": "<id>"` in `brand.json`. Logo and IG icon stay brand-specific under `brands/<id>/assets/`.

Each design system declares an **engine** in its `design-system.json` manifest:

| Engine | Authored as | Renderer | Tool schemas | Systems shipped |
|--------|-------------|----------|--------------|-----------------|
| `html-tokens` | Hand-written `.html` with `__TOKEN__` placeholders | `src/tools/carousel-cover.ts` (covers + body) + `src/tools/photo-overlay.ts` (photo-led) | Rich, per-template; enums derive from manifest `templates.{cover,body,photoOverlay}` lists | `editorial-paper` (9 covers + 7 body + 4 photo-overlays) |
| `react-jsx` | `template.jsx` React component with `{ slide, idx, total, handle, year, pal, fonts, mark }` props | `src/tools/react-slide.ts` — loads shared `src/react-runtime/shared.jsx` + the template JSX into a Puppeteer page with React 18 + Babel Standalone, screenshots after mount | Discriminated union per slide kind (`cover / intro / numbered / stat / list / image / cta`) with kind-specific slot shapes | `atelier`, `signal`, `mute`, `gridos`, `bloom`, `nocturne`, `archive`, `riso`, `vapor`, `bauhaus`, `terminal`, `couture` |

`loadDesignSystem(id, designSystemsDir)` reads the manifest, validates it against a union of `HtmlTokenManifestSchema` and `ReactJsxManifestSchema`, and returns `{ ...manifest, rootDir }`. `isHtmlTokens()` / `isReactJsx()` narrow the type so tool-building code only sees the fields that apply.

To add a new system: drop `design-systems/<new-id>/{design-system.json, templates/ | template.jsx, assets/fonts/}` and set `"designSystem": "<new-id>"` in a brand. Tool schemas re-derive automatically — no orchestrator code change.

## Image Generation Engines

The project has **four image engines** chosen per use case. A → C are local *compositing* engines (typography, layout, branding overlays); D is the *external* pixel-generation engine (text-to-image via the carephoto Agent API). D's output usually flows through C (or A's `photo_overlay`) before reaching `schedule_post`.

### Engine A: Puppeteer + HTML/token template (carousel_cover + body_slide + photo_overlay, html-tokens design systems)

For editorial covers AND body slides where typography + layout quality matter. Both tools share the same `renderCarouselCover` function in `src/tools/carousel-cover.ts`; they differ only in which `templateId` enum the agent can pick (cover names for `carousel_cover`, `body-*` names for `body_slide`):

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

Why this engine: CSS is the best typography engine that exists. Font pairing, blend modes, large decorative glyphs, curved text — all trivial. Templates are hand-crafted for visual quality; new templates are added by dropping an `.html` file in `brands/<brand>/templates/` and registering the id in either the `carousel_cover` (cover) or `body_slide` (body) tool's `templateId` enum.

### Engine B: Puppeteer + React/JSX (carousel_cover + body_slide, react-jsx design systems)

Each react-jsx design system ships a single `template.jsx` with a function that dispatches on `slide.kind`. `renderReactSlide` wires it up:

```
design-systems/<id>/template.jsx          src/react-runtime/shared.jsx
         │                                           │
         └───────────────────┬───────────────────────┘
                             ▼
             Inlined as <script type="text/babel"> into a
             minimal HTML shell with React 18 + Babel Standalone
             + Google Fonts <link> from manifest.googleFontsUrl
                             │
                             ▼
                 Bootstrap <script>:
                   PROPS = { slide, idx, total, handle, year, pal, fonts, mark }
                   ReactDOM.createRoot(#root).render(<Renderer {...PROPS} />)
                   document.body.setAttribute('data-ready', '1')
                             │
                             ▼
             Puppeteer waits for `body[data-ready]`, waits
             for fonts.ready, then screenshots 1080×1350.
                             │
                             ▼
                  tmp/react-slides/<uuid>.png
```

~2.4s per slide (Babel compile + React mount + screenshot). The bootstrap also listens for `pageerror` / console.error so mistranspiled JSX surfaces in Node logs.

### Engine C: sharp + SVG (brand_image)

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

### Engine D: carephoto Agent API (compose_image_prompt + generate_image)

For posts that need a *photo*, not a typographic slide. Two-tool pipeline — the prompt-quality step is mandatory, not optional:

```
agent decides post topic + visual archetype (ugc/product/editorial/bts/hero)
                        │
                        ▼
            compose_image_prompt
              │  Anthropic Haiku 4.5 with a tight system prompt:
              │  - bans AI-cliché tokens (creative woman, studio
              │    workspace, film grain, cinematic, golden hour…)
              │  - requires named subject + 3-6 props + specific
              │    location + specific light/moment + composition cue
              │  - picks the model best suited to the prompt's
              │    character (see model lineup below)
              ▼
        { prompt, recommendedModel, rationale }
                        │
                        ▼
            generate_image
              │  POST {CAREPHOTO_BASE_URL}/generate with
              │  Authorization: Bearer ck_live_…
              │  body: { prompt, aspectRatio, model, style? }
              │  - server-side adds carephoto's house-style modifiers
              │    (do NOT add them client-side — double-applied)
              │  - returns public Supabase URL + creditsUsed,
              │    estimatedUsdCost, generationId, w/h
              ▼
        imageUrl (public, stable)
                        │
        ┌───────────────┼────────────────────────────────┐
        ▼               ▼                                ▼
  brand_image     photo_overlay (Engine A)         schedule_post images[]
  (Engine C)      editorial overlay templates       (raw, unbranded — only
                                                    appropriate for the
                                                    rare model-comparison
                                                    case where the raw
                                                    output IS the message)
                        │
                        ▼
                 schedule_post
```

**Model lineup** (all selectable via `compose_image_prompt`'s `recommendedModel`; agent should pass that through verbatim):

| Model | Resolution | ~Cost | Best for | Constraint |
|-------|------------|-------|----------|------------|
| `nano-banana-2` | ~1K | $0.08 | Versatile photoreal default; UGC-style candid scenes; fallback when nothing else fits | — |
| `nano-banana-pro` | 2K | $0.15 | Premium photoreal "money shot" — hero portraits, talent close-ups, premium product | Cost; reserve for high-value posts |
| `flux-lora` | ~1MP | $0.04 | Cinematic photography, consistent subject identity, strong stylistic prompts | — |
| `recraft` | ~1K | $0.04 | Clean stylized brand/ad creative; vector-leaning illustration; "designed-not-shot" aesthetic | — |
| `seedream-v5-lite` | 3K | $0.04 | High-res general-purpose with rich detail; complex multi-element scenes that benefit from resolution | — |
| `qwen-image-2-pro` | 2K | $0.04 | Distinctive aesthetic; typography-heavy posters | **Safety checker disabled** — content responsibility on caller |
| `gpt-image-2` | 3K | $0.11 | Editorial polish; brand assets needing legible text/logos/signage/infographics in frame | **SFW only** — OpenAI moderation cannot be disabled; mildly edgy prompts return 422 |

The composer's system prompt has a per-`visualStyle` decision tree (e.g. `ugc → nano-banana-2`, `editorial+SFW → gpt-image-2`, `product+legible-text → gpt-image-2 or recraft`, `hero → gpt-image-2 if SFW else nano-banana-pro`). It also factors in content sensitivity — if the post angle could trip OpenAI moderation, the composer steers away from `gpt-image-2` even when polish would otherwise win.

**The default** in `brand.json` (`imageGeneration.defaultModel`) only matters as a fallback for direct calls that bypass the composer (e.g. one-off scripts). In normal agent flow the composer's recommendation overrides it.

**Failure modes** — `generate_image` returns a string (not an exception) so the agent sees the error and can recover:
- Network timeout / TCP refused → `"network error: …"` (most common cause: local carephoto server not running, or `CAREPHOTO_BASE_URL` misconfigured)
- 401 unauthorized → bad/missing/revoked `CAREPHOTO_API_KEY`
- 402 quota_exceeded → out of credits
- 422 content_filter → prompt blocked by provider; **credits auto-refunded**; agent should retry with a different prompt or model
- 429 rate_limited → `Retry-After` header surfaced; agent backs off
- 502 provider_error → upstream model failed; **credits auto-refunded**; agent should retry

`compose_image_prompt` has its own fallback path: if the Haiku call fails or returns malformed JSON, it returns `{prompt: <postContext>, recommendedModel: "nano-banana-2", rationale: <error explanation>}` so the agent isn't blocked, but the rationale flags that the prompt should be rewritten manually before generate_image.

**Cost discipline**: the system prompt enforces ~80% of posts use prompt-bank images (free per call, dedup-tracked) and reserves `generate_image` for trend-reactive content or specific concepts the bank can't cover. Carousels mix one fresh hero image with prompt-bank slides — never every slide generated.

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

## Template System: `html-tokens` engine

Templates live in `design-systems/<id>/templates/*.html`. Each is a self-contained HTML doc with:

- `@font-face` rules with `__FONT_*__` tokens (substituted with `file://` URLs at render time)
- Content slot tokens: `__HEADLINE__`, `__KICKER__`, `__SUBTITLE__`, `__ACCENT_COLOR__`, `__DECORATIVE_CHAR__`, `__STICKER__`, `__PAGE_INDICATOR__`, `__LOGO__`, `__IG_ICON__`, `__HANDLE__`
- Background slot: `__BG_LAYER__` (filled by gradient renderer or cream background)
- Theme slots: `__TEXT_COLOR__`, `__SUBTITLE_COLOR__`, `__LOGO_FILTER__`, `__PAGE_INDICATOR_BG__`, `__GRID__`, `__GRID_COLOR__`

`editorial-paper` ships 9 covers + 7 body templates + 4 photo-overlay templates, progress-bar/CSS-var injection for top-of-slide pagination (dark-list-body + dark-bold-body + dark-compare-body + cream-numeric-cover + spec-annotated-cover), and a second engine concept that some templates use: pipe-separated strings in `subtitle` render as pill chips, pipe-separated strings in `decorativeChar` render as arrow-bullet lists. `photo_overlay` uses the `photo-*` templates and embeds the source photo as a data URL behind the text overlay.

### Cover templates (9) — used by `carousel_cover` (editorial-paper)

| Template | Layout | Use for |
|----------|--------|---------|
| `headline-accent` | Kicker + big serif headline + italic-accent word + subtitle + optional decorative glyph + optional sticker bubble | Listicles, numbered hooks, general statements |
| `quote-hero` | Giant italic serif pull-quote with left accent rule + oversized quote mark. Accent word rendered with 6px underline at 14px offset (Instrument Serif is single-weight, so underline is the only way to add pop) | Pithy sentences, manifestos, bold user-style quotes |
| `stat-drop` | Massive 520px serif stat ('3X', '89%', 'ZERO') with accent bar + explainer | Dramatic numbers as the hero |
| `question-lead` | Big italic serif question + giant background '?' glyph + accent-ruled answer tease inside a chip backdrop with `backdrop-filter: blur(6px)` and full-contrast text (so it reads on aurora/dark moods) | Curiosity hooks, engagement bait |
| `split-compare` | Top/bottom BEFORE/AFTER halves with scrim + center arrow divider | Studio-vs-AI, old-way-vs-new-way contrasts |
| `kicker-led` | 96px bold sans kicker as the hero + small serif body line + huge corner index numeral | Section headers, 'Part 1' chapter covers |
| `dark-hero-cover` | Charcoal paper with grain + grid + corner registration marks; huge condensed sans headline with dashed-bracketed serif-italic accent word; optional blue speech-bubble sticker | Premium/editorial, bold statements |
| `cream-numeric-cover` | Red italic-serif kicker + giant accent numeral (`decorativeChar`) beside huge bold sans headline + italic-serif underlined subtitle + optional blue sticker | `[N] Signals / Signs / Tips` numeric leads |
| `spec-annotated-cover` | Cream paper in architectural-spec aesthetic with hatched margin strips, red italic spec-number annotations, red-bordered rounded-square number box, squiggle arrow | `[N] Mistakes / Rules / Myths` where the number IS the hero |

### Body-slide templates (7) — used by `body_slide`

| Template | Layout | Use for |
|----------|--------|---------|
| `body-list-item` | Giant accent numeral ('01', '02') + short Geist heading + multi-line body paragraph | Numbered tips, listicle body points |
| `body-pullout` | Italic serif insight sentence with accent rule + supporting paragraph below | Key takeaways, mini-insights between sections |
| `body-quote` | Italic serif testimonial with oversized opening quote glyph + em-dashed attribution | User testimonials, expert pulls (smaller than cover `quote-hero`) |
| `body-caption-led` | Tiny uppercase kicker label + heavy Geist Black lead sentence + body paragraph | Story beats, expanded explanations |
| `dark-list-body` | Top carousel progress bar + small serif kicker + huge serif headline. Optional pill-chip row (pipe-separated `subtitle`) and arrow-bullet list (pipe-separated `decorativeChar`) | Dark-mode tips, font/term catalogues |
| `dark-bold-body` | Same dark aesthetic but headline is HUGE bold condensed sans. Bullets from `decorativeChar`, closing line from `subtitle` | Statement-headline tips ('They Think In Systems') |
| `dark-compare-body` | Two side-by-side ✓/✕ mock UI panels with "Note" callout. Labels from `decorativeChar` as `'Good | Bad'`, note paragraph from `subtitle` | DO/DON'T, clear-vs-cluttered comparisons |

### Photo-overlay templates (4) — used by `photo_overlay` (editorial-paper)

| Template | Layout | Use for |
|----------|--------|---------|
| `photo-caption-bar` | Cream caption bar at bottom with serif headline + sans subtitle | Magazine-style photo posts |
| `photo-quote-center` | Centered italic serif quote with dark cinematic scrim + oversized quotation mark | Attention-grabbing single photos |
| `photo-editorial-stack` | Top-left kicker + huge serif headline with top-biased gradient scrim | Magazine cover |
| `photo-chip-corner` | Small cream pill chip at bottom-right — minimal, lets the photo breathe | Understated captions |

### Adding a new html-tokens template

1. Copy an existing template file to `design-systems/<id>/templates/<new-id>.html`
2. Edit layout + CSS (keep all token placeholders the renderer substitutes)
3. Add the new id to the `templates.{cover,body,photoOverlay}` array in `design-systems/<id>/design-system.json`
4. Tool enums regenerate automatically. Tell the agent in the system prompt when to pick it.

### Adding a new react-jsx design system

1. Drop `design-systems/<new-id>/template.jsx` exporting `window.<Name>Template = function(...)` with the same props shape as the other systems
2. Drop `design-systems/<new-id>/design-system.json` with `engine: "react-jsx"`, `templateName`, `googleFontsUrl`, font stack, `palettes.{light,dark}`, and the `slideKinds` it supports
3. Any brand can now select it via `"designSystem": "<new-id>"` in `brand.json`

## Accent color precedence

Every render picks an accent color with this fallback chain:

1. **Per-call** — the agent passes `accentColor` (hex) to `carousel_cover` / `body_slide` / `photo_overlay`. Overrides everything for that one render.
2. **Per-brand** — if unset, `brand.branding?.colors?.accent` is used (set in `brand.json`). This applies to both engines so a brand can enforce a consistent accent across posts regardless of the design system.
3. **Per-design-system** — if still unset, the system's default is used. html-tokens: `defaultAccentPalette[]` picked at random or via `pickAccentForMood()` if a gradient mood is active. react-jsx: `palettes.{mode}.accent`.

This lets a brand manager pick a design system, then optionally override its accent with their own, without editing either file.

## Fonts

Fonts live with the design system that uses them, not with the brand.

- **`editorial-paper`** (html-tokens) ships local font files in `design-systems/editorial-paper/assets/fonts/` — Instrument Serif (display + italic accent) and Geist (sans regular/bold/black). Referenced as `file://` URLs at render time.
- **react-jsx systems** (atelier, signal, …) declare their font stack in the manifest and link a `googleFontsUrl` at render time — atelier pulls Fraunces + Inter + JetBrains Mono, signal pulls Archivo Black + Space Grotesk + Space Mono, etc. No local font files needed for these.

`brand_image` (sharp pipeline) uses **SF Old Republic** — declared in `brand.json.branding.fontPath`, embedded via base64 `@font-face` in the SVG overlay. This stays under `brands/<id>/assets/` because `brand_image` is the only pipeline that uses it and it's a brand-specific display choice, not a design-system concern.

## Posting Pipeline: `src/tools/schedule-post.ts`

```
input.images[]
      │
      ├── URL (http/https)  →  uploadImageFromUrl()  →  POST /upload-from-url
      │                        keeps original URL as path (Instagram fetches this)
      │
      └── Local path  →  tunnel-health check (isTunnelHealthy)
                          │
                          ├── healthy  →  sharp re-encode to baseline JPEG (Q92, no progressive)
                          │               →  uploadImageFile() →  POST /upload (multipart)
                          │               →  rewrite localhost path to POSTIZ_TUNNEL_URL
                          │
                          └── unhealthy → upload file to catbox.moe (public CDN)
                                        →  uploadImageFromUrl(catboxUrl) tells Postiz to record it
                                        →  catbox URL is what Meta fetches
      │
      ▼
POST /posts  →  Postiz schedules to Instagram
      │
      ▼
Records to DB: posts table (with source_images[]) + content_calendar
```

### Image encoding (shipped 2026-04-23)

`sharp` re-encodes every local upload to **baseline JPEG** (Q92, `chromaSubsampling: "4:2:0"`, `progressive: false`, `flatten({background:"#fff"})`). Why each choice:
- JPEG not PNG: Meta's IG Graph API ingester is more reliable on JPEGs. PNG carousels intermittently fail with `code 9004 / error_subcode 2207052 "Only photo or video can be accepted as media type"` on random slides.
- Baseline (non-progressive): progressive JPEG triggers the same 2207052 error. Sharp's `mozjpeg: true` enables progressive by default — **don't use it** here.
- Flatten to white: avoids alpha-channel surprises when Meta converts to JPEG internally.

### Tunnel-health check + catbox fallback (shipped 2026-04-23)

`isTunnelHealthy()` runs before each batch of uploads:
1. **Live HEAD probe** — `GET {POSTIZ_TUNNEL_URL}/robots.txt` with a 5s timeout. 5xx or timeout → unhealthy.
2. **History scan** — `docker logs postiz-tunnel --since 90m` grepped for `timeout: no recent network activity | ended abruptly | Connection terminated`. Any match → unhealthy.
3. Docker unreachable (CI, other machines) → falls through to healthy.

When unhealthy, local files upload to **catbox.moe** (free, anonymous, `POST https://catbox.moe/user/api.php reqtype=fileupload`) and the public catbox URL is handed to Postiz via `upload-from-url`. Meta fetches from catbox instead of `postiz.mertokar.com`.

**Why this exists:** Meta maintains an internal "host health" score per domain. When our tunnel had QUIC/datagram flakes (2026-04-23, 10:06 / 11:41 / 12:00 UTC), Meta's URL validator caught aborted `/robots.txt` fetches and blacklisted the domain for hours — returning 2207052 on every subsequent media-container creation *without even retrying the fetch*. Catbox has a clean reputation and is a pressure-relief valve until uploads move to R2/S3 permanently.

The tunnel path is still preferred when healthy — catbox is a fallback, not the default.

### Outlier protection (shipped 2026-04-21)

Without guardrails the agent would over-weight any one-off hot post (friend reposts, paid boost, algo quirk). Two layers protect against this.

**Layer 1 — user annotation** via `npm run flag-outlier`:

```
npm run flag-outlier -- --list                              # show recent posts with internal ids
npm run flag-outlier -- 23 --reason "200K friend reposted"  # flag post #23
npm run flag-outlier -- 23 --unflag                         # clear flag
```

Persists `posts.is_outlier` (0/1) + `posts.notes` (free text). `get_post_performance` surfaces both to the agent with a `⚠ USER-FLAGGED OUTLIER: <reason>` line so the agent can read the *why* and discount the row.

**Layer 2 — auto stats flag** in `getPostPerformanceTool`:
- Computes rolling median + sorted distribution over the last 20 non-outlier posts (`BASELINE_WINDOW = 20`).
- Each row is annotated as `N likes (X.X×, pN)` — value, multiple-of-median, and percentile within the baseline pool.
- Any post hitting `≥5×` the median on likes / views / reach gets a `⚠ STATS-FLAGGED (X.X× median) — possible external boost` line.
- User-flagged posts are excluded from the baseline so the statistics aren't skewed by the row they're meant to protect against.

Thresholds in `src/tools/post-performance.ts`:
- `BASELINE_WINDOW = 20` — how many recent non-outlier posts form the baseline
- `OUTLIER_MULTIPLIER = 5` — multiple of median that triggers the auto-flag

### Analytics ingestion (shipped 2026-04-21)

Runs at the top of every `runAgent` call (fails soft if Postiz is down). Module: `src/tools/ingest-analytics.ts`.

Two phases:

1. **Backfill** — for any `posts` row missing `external_post_id`, fetch `GET /posts?startDate=…&endDate=…` from Postiz and match candidates by caption-prefix containment + same publish day. Stores the matched Postiz id via `setExternalPostId()`.
2. **Snapshot** — for every post with an `external_post_id`, fetch `GET /analytics/post/{id}`. Parses the `[{label, data:[{date, total}]}]` array into flat metrics and appends an `analytics` row (one row per ingestion, so metrics are time-series). Postiz exposes for IG: Views, Reach, Saves, Likes, Comments, Shares. Impressions / profile visits / link clicks stay at 0 (not in Postiz's response for IG).

`get_post_performance` selects the LATEST analytics row per post via a `(SELECT post_id, MAX(measured_at))` join, so historical snapshots don't dilute the numbers the agent sees.

Dependencies downstream:
- `schedulePost` now returns `{ ok, message, postizId?, groupId? }` instead of a string. The orchestrator persists `postizId` as `external_post_id` in `insertPost`. Legacy posts without an id are healed by the backfill phase.
- When Postiz's `POST /posts` response doesn't include a per-platform post id, `schedulePost` falls back to `GET /posts?startDate=…&endDate=…` filtered by group + integration id.

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

**Note:** Postiz returns 200 on post creation even when Instagram delivery fails later. Check `state: "PUBLISHED"` via `GET /posts?startDate=...&endDate=...` to confirm actual delivery. Delete stale/error posts with `DELETE /posts/:id`. `GET /posts/:id` returns 404 on self-hosted — list via the date-range endpoint.

## Database: SQLite (`marketing-agent.db`)

Schema in `src/db/schema.ts`, queries in `src/db/queries.ts`.

```
posts
├── id, brand_id, caption, hashtags (JSON), image_url
├── posted_at, platform, external_post_id, content_theme
├── source_images (JSON array of prompt IDs) ← dedup key
└── created_at

analytics  (populated daily by ingest-analytics.ts; append-only time-series)
├── id, post_id (FK→posts), brand_id
├── likes, comments, shares, reach, impressions
├── views, saves                               ← added 2026-04-21 (Postiz IG metrics)
├── profile_visits, link_clicks                ← not in Postiz IG response; stay 0
└── measured_at  (one row per ingestion pass)

posts  (outlier-protection columns added 2026-04-21)
├── is_outlier      (0/1, user-set via npm run flag-outlier)
├── notes           (free text: "200K friend reposted" etc.)
└── …existing columns…

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

Loaded by `src/config/load-brand.ts` with Zod validation. Brand files are now **thin** — templates and fonts live in design systems, leaving only brand-specific logos and icons in `brands/<id>/assets/`.

```
brands/
  carephoto/
    brand.json             ← { designSystem: "editorial-paper", branding.colors.accent, … }
    assets/
      v4Logo_white_nobackground.png
      v4Logo_black_nobackground.png
      sf-old-republic.regular.ttf            ← used by brand_image (sharp)
      instagram-logo-no-background.png

design-systems/
  editorial-paper/                            ← html-tokens engine
    design-system.json
    templates/
      headline-accent.html
      dark-list-body.html
      photo-caption-bar.html
      …  (20 templates)
    assets/
      fonts/
        InstrumentSerif-Regular.ttf
        Geist-Regular.ttf
        …
  atelier/                                    ← react-jsx engine
    design-system.json                        ← googleFontsUrl, palettes, slideKinds
    template.jsx                              ← AtelierTemplate(props) → JSX
  signal/
    design-system.json
    template.jsx
  …  (12 react-jsx systems total)

src/react-runtime/
  shared.jsx                                  ← loaded by every react-jsx render
```

Key config sections in `brand.json`:
- **Core**: id, name, domain, niche, description, tone, keywords — all flow into the system prompt + `get_trending_topics` relevance scoring
- **Competitors**: array of {name, website, instagram?}
- **Posting**: frequency (daily/weekdays/custom), preferredTime
- **Design system** (optional): `designSystem: "<id>"` — default is `editorial-paper`
- **Branding** (optional): logo, font (for `brand_image` only), IG icon, `colors.accent` (per-brand default accent — overrides the design system's default), `accentPalette` (used by html-tokens covers when no gradient is active), toggle for each overlay element
- **Carousel** (optional): frequency target (0.4 = 40%), min/max slides
- **Image generation** (optional): `imageGeneration: { enabled: bool, provider: "carephoto", defaultModel: <one of 7>, defaultAspectRatio: "1:1"|"4:5"|"9:16" }` — gates `compose_image_prompt` and `generate_image` tools. `defaultModel` is a fallback for one-off scripts; the agent uses `compose_image_prompt`'s recommended model in normal flow.
- **Prompt bank** (optional): path to JSON file of existing AI-generated images
- **Hot topics** (optional): `{ relevantThemes: string, sourcesFile?: string }`. `relevantThemes` is a free-form description of what makes a topic `high`/`medium`/`low` relevance for this brand — injected verbatim into the `get_trending_topics` Haiku system prompt. `sourcesFile` overrides the sources filename (defaults to `hot-topics-sources.json` in the brand dir).

Per-brand hot-topics sources live at `brands/<id>/hot-topics-sources.json` (resolved by `brandSourcesPath(brand)` in `load-brand.ts`). The schema matches the global file: `{ sources: [{id, name, category, type, url}] }` where `type ∈ {rss, hackernews, reddit, firecrawl-search}`.

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
- Image source decision (only when `brand.imageGeneration.enabled`):
  - DEFAULT to `browse_prompt_bank` for ~80% of posts (free per call, dedup-tracked)
  - Use `generate_image` only for trend-reactive content the bank can't cover, or to demonstrate a specific model launch
  - **MANDATORY**: every `generate_image` call must be preceded by `compose_image_prompt`. Agent passes both `prompt` and `recommendedModel` from the composer's response straight through. The system prompt explicitly bans agent-written prompts to `generate_image` to avoid AI-cliché output.
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
BRANDFETCH_API_KEY=        # Brand-logo fetches (get_brand_logo). Free tier ~500K calls/mo.
CAREPHOTO_API_KEY=         # carephoto Agent API (ck_live_…). Required when brand.imageGeneration.enabled.
CAREPHOTO_BASE_URL=        # Default: https://carephoto.art/api/v1/agent. Set to http://localhost:3000/api/v1/agent when running carephoto's Next.js server locally — the Agent API is only deployed there today (prod carephoto.art does not yet expose /api/v1/agent endpoints).

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
- **Hashtag cap: 5 per post** — Instagram changed this in late 2025 / 2026. More than 5 triggers a `"too many product tags"` delivery error. System prompt enforces 3-5 highly-relevant tags.

## What's Not Yet Built

1. **Dry-run mode** — no `--dry-run` flag to skip actual Postiz posting
2. **Concurrency limits** — parallel puppeteer renders (covers + body slides) can stress Chromium (5+ simultaneous renders occasionally time out). Agent auto-retries so non-blocking, but worth a semaphore later
3. **Delivery verification loop** — poll `GET /posts?state=PUBLISHED` after scheduling to flag ERROR deliveries and release their source_images (currently prompts get marked used at schedule time, even if IG delivery later fails)
4. **Permanent media CDN (R2 / S3)** — catbox is a pressure-relief fallback, not a long-term host. Planned alongside multi-tenant rollout: upload every media to Cloudflare R2 (or equivalent), serve from a stable CDN that's not our Docker tunnel. This removes the Meta host-health risk entirely.
5. **Brand-logo integration on more cover templates** — currently only `dark-hero-cover` renders the `__BRAND_LOGO__` slot. Other cover templates (`headline-accent`, `split-compare`, `stat-drop`, the cream-paper covers) should opt into the token with template-appropriate positioning so the agent can use any cover style for a trend-reaction.
6. **Tunnel-health proactive alerts** — `isTunnelHealthy()` currently only gates the upload path. When unhealthy, also ping the user (notification) so they know the tunnel flaked and Meta may be cooling down.
7. **Image-prompt reviewer (parked)** — a vision-enabled Haiku call between `generate_image` and the branding step that scores the actual rendered image against the post angle and triggers regeneration on low scores. Not built yet — `compose_image_prompt` proved sufficient on the first 3 production samples; revisit only if a recurring failure pattern shows up.
