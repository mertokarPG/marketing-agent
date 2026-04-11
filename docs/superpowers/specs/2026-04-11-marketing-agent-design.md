# Autonomous Marketing Agent — Design Spec

## Overview

A brand-agnostic autonomous marketing agent that runs daily via cron, researches competitors and trends, generates content strategy, and posts to Instagram. Built with Node.js + TypeScript, powered by Claude's tool use via the Anthropic SDK Tool Runner.

First brand: **carephoto.art** (AI photo editing studio).

## Architecture

### Tech Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Runtime | Node.js + TypeScript | Familiar, clean types |
| AI | `@anthropic-ai/sdk` Tool Runner (beta) | Automatic agentic loop, Zod-based tool schemas |
| Model | `claude-sonnet-4-6` | Cost-effective for daily runs ($3/$15 per 1M tokens) |
| Scraping | Firecrawl (`@mendable/firecrawl-js`) | Competitor monitoring, trend research |
| Posting | Postiz | Instagram scheduling, simpler than raw Meta Graph API |
| Database | SQLite (`better-sqlite3`) | Local, zero-config, stores posts + analytics + competitor data |
| Scheduling | `node-cron` | Daily trigger at 7am |
| Notifications | `nodemailer` | Email alerts to owner |
| TS Runner | `tsx` | Run TypeScript directly, no build step |

### Agent Loop

```
node-cron (7am daily)
    |
    v
orchestrator.ts -- loads brand config, gathers context, calls Claude
    |
    v
Claude (sonnet-4-6) + Tool Runner
    |
    +-- scrape_competitor(name, url)       --> Firecrawl
    +-- search_trends(keywords)            --> Firecrawl web search
    +-- get_recent_posts(brandId, limit)   --> SQLite
    +-- get_post_performance(brandId)      --> SQLite
    +-- schedule_post(caption, hashtags, imageUrl, scheduledTime) --> Postiz
    +-- send_notification(subject, body)   --> Email
    |
    v
Results saved to SQLite. Notification sent.
```

Claude receives full brand context (config, recent posts, performance data, content calendar) and autonomously decides:
- Whether to post today or skip
- Which competitors to research
- What trends to investigate
- Content theme, caption, hashtags, posting time
- Whether to just log insights instead of posting

The Tool Runner handles the agentic loop — no manual while/break logic.

## Brand Config System

Each brand is a JSON file in `brands/`. The orchestrator loads whichever brand is specified via CLI arg or env var.

```typescript
interface BrandConfig {
  id: string;
  name: string;
  domain: string;
  niche: string;
  description: string;
  competitors: Array<{
    name: string;
    instagram?: string;
    website?: string;
  }>;
  keywords: string[];
  tone: string;
  instagram: {
    accountId: string;
    accessToken: string;
  };
  postingSchedule: {
    frequency: "daily" | "weekdays" | "custom";
    preferredTime: string; // HH:mm
  };
}
```

Adding a new brand = adding a new JSON file. No code changes needed.

### First Brand: carephoto.art

**Competitors:**
- Higgsfield — AI photo/video generation, social media use cases
- Kaze AI — AI image generation with style pages
- Easy-Peasy AI — 200+ style library, prompt-to-image
- Clipfly AI — Generic AI image generator, massive SEO
- VEED.io / Photofeeler — AI dating profile photos
- Remini — AI photo enhancer, dating photo marketing
- Lensa AI — Portrait/avatar generation, dating space
- The Match Artist — Dedicated AI dating photo service
- uwear.ai — Virtual try-on / AI fashion imagery
- Artguru AI — AI photo generator, many style categories
- PicWish / Fotor — AI photo editing with generator features
- Leonardo AI — AI image generation platform, community

**Keywords:** AI photo editor, AI dating photos, AI portrait, photo enhancement, AI headshots, AI photo studio

## Tool Definitions

Six tools defined with Zod schemas + `run` functions:

### scrape_competitor
- **Input:** `{ name: string, url: string }`
- **Output:** Recent posts summary, engagement patterns, content themes
- **Implementation:** Firecrawl scrape of Instagram profile or website

### search_trends
- **Input:** `{ keywords: string[] }`
- **Output:** Trending topics, hashtags, content angles
- **Implementation:** Firecrawl web search for niche keywords

### get_recent_posts
- **Input:** `{ brandId: string, limit: number }`
- **Output:** Last N posts with captions, dates, content themes
- **Implementation:** SQLite query on `posts` table

### get_post_performance
- **Input:** `{ brandId: string, limit: number }`
- **Output:** Reach, likes, profile visits, link clicks per post
- **Implementation:** SQLite query joining `posts` + `analytics`

### schedule_post
- **Input:** `{ caption: string, hashtags: string[], imageUrl: string, scheduledTime?: string }`
- **Output:** Confirmation + external post ID
- **Implementation:** Postiz API call

### send_notification
- **Input:** `{ subject: string, body: string }`
- **Output:** Sent confirmation
- **Implementation:** nodemailer to configured email

## Data Model (SQLite)

### posts
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| brand_id | TEXT | References brand config id |
| caption | TEXT | Post caption |
| hashtags | TEXT | JSON array of hashtags |
| image_url | TEXT | URL to post image |
| posted_at | TEXT | ISO timestamp |
| platform | TEXT | "instagram" |
| external_post_id | TEXT | ID from Postiz/Instagram |
| content_theme | TEXT | e.g. "before-after", "tutorial", "trending" |
| created_at | TEXT | ISO timestamp |

### analytics
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| post_id | INTEGER FK | References posts.id |
| brand_id | TEXT | References brand config id |
| likes | INTEGER | |
| comments | INTEGER | |
| shares | INTEGER | |
| reach | INTEGER | |
| impressions | INTEGER | |
| profile_visits | INTEGER | |
| link_clicks | INTEGER | |
| measured_at | TEXT | ISO timestamp |

### competitor_snapshots
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| brand_id | TEXT | Which brand this competitor belongs to |
| competitor_name | TEXT | |
| content_summary | TEXT | Claude's summary of their recent activity |
| engagement_notes | TEXT | Notable engagement patterns |
| scraped_at | TEXT | ISO timestamp |

### content_calendar
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| brand_id | TEXT | |
| planned_date | TEXT | YYYY-MM-DD |
| theme | TEXT | Content theme |
| caption_draft | TEXT | Generated caption |
| hashtags | TEXT | JSON array |
| status | TEXT | "planned", "posted", "skipped" |
| reasoning | TEXT | Why Claude chose this theme or skipped |
| created_at | TEXT | ISO timestamp |

## Folder Structure

```
marketing-agent/
  src/
    orchestrator.ts        // main agent loop - loads brand, gathers context, runs Claude
    tools/
      scrape-competitor.ts // Firecrawl scrape competitor profiles
      search-trends.ts     // Firecrawl web search for trends
      recent-posts.ts      // SQLite query for post history
      post-performance.ts  // SQLite query for analytics
      schedule-post.ts     // Postiz API integration
      notify.ts            // Email notification
    db/
      schema.ts            // SQLite table creation
      queries.ts           // Read/write helpers
    config/
      load-brand.ts        // Load and validate brand JSON
      system-prompt.ts     // Build Claude's system prompt from brand config
    index.ts               // Entry point - starts cron, CLI support
  brands/
    carephoto.json         // First brand config
  .env                     // API keys
  package.json
  tsconfig.json
```

## System Prompt Strategy

Claude receives a system prompt built from the brand config:

```
You are an autonomous marketing agent for {brand.name} ({brand.domain}).

About the brand: {brand.description}
Brand voice: {brand.tone}
Niche: {brand.niche}

Your job is to run the daily marketing cycle:
1. Research competitors and trends using your tools
2. Review recent post performance
3. Decide on today's content strategy
4. Generate and schedule a post (or decide to skip with reasoning)
5. Send a summary notification

Today is {date}, {dayOfWeek}.

Recent post history and performance data will be provided when you query for it.
Competitors to monitor: {brand.competitors map to names}

Guidelines:
- Post daily unless there's a good reason not to
- Vary content types: before/after, tips, user showcases, trending topics
- Learn from past performance — do more of what works
- Keep captions authentic to the brand voice
- Use 20-30 relevant hashtags per post
- Always explain your reasoning in the content calendar
```

## Notifications

Three notification types via email:
- **Post published** — caption preview, image URL, scheduled time
- **Daily summary** — what the agent decided and why, even if it skipped
- **Error alert** — API failures, posting errors

## Error Handling

- **Firecrawl fails** — Claude continues with available data, notes the gap
- **Postiz/posting fails** — saves to content_calendar as "planned", notifies, retries next run
- **Claude API fails** — logs error, sends notification, skips the day
- **SQLite errors** — crash + notification (shouldn't happen with local DB)

No complex retry logic for v1. Fail, log, notify, move on.

## Image Handling (v1)

For v1, images are provided manually — you upload to a URL or local path, and `schedule_post` references that URL. The content calendar stores image references.

Future: carephoto.art CLI integration so the agent can auto-generate images.

## Environment Variables

```
ANTHROPIC_API_KEY=
FIRECRAWL_API_KEY=
POSTIZ_API_KEY=
NOTIFY_EMAIL=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
BRAND=carephoto   # which brand config to load
```

## Out of Scope for v1

- Dashboard (Phase 4)
- TikTok posting (Phase 4)
- Auto image generation via carephoto.art CLI
- Multi-platform posting (Twitter/X, LinkedIn)
- A/B testing
- Human approval workflow (auto-post mode)
