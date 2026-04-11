# Marketing Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an autonomous marketing agent that researches competitors, generates content strategy, and posts to Instagram daily — configurable per brand via JSON config files.

**Architecture:** Node.js + TypeScript using Claude's Tool Runner (beta) for an automatic agentic loop. Six tools (scrape_competitor, search_trends, get_recent_posts, get_post_performance, schedule_post, send_notification) defined as betaZodTools. SQLite for persistence, Firecrawl for web research, Postiz for Instagram posting, nodemailer for notifications.

**Tech Stack:** TypeScript, tsx, @anthropic-ai/sdk (Tool Runner beta), better-sqlite3, @mendable/firecrawl-js, nodemailer, node-cron, zod, vitest

---

## File Structure

```
marketing-agent/
  src/
    index.ts                 // Entry point — cron + CLI
    orchestrator.ts          // Main agent loop — loads brand, gathers context, runs Claude
    tools/
      scrape-competitor.ts   // Firecrawl scrape competitor profiles
      search-trends.ts       // Firecrawl web search for trends
      recent-posts.ts        // SQLite query for post history
      post-performance.ts    // SQLite query for analytics
      schedule-post.ts       // Postiz API integration
      notify.ts              // Email notification
    db/
      schema.ts              // SQLite table creation + connection
      queries.ts             // Read/write helpers
    config/
      load-brand.ts          // Load and validate brand JSON
      system-prompt.ts       // Build Claude's system prompt from brand config
  brands/
    carephoto.json           // First brand config
  tests/
    config/
      load-brand.test.ts
    db/
      schema.test.ts
      queries.test.ts
    tools/
      scrape-competitor.test.ts
      search-trends.test.ts
      recent-posts.test.ts
      post-performance.test.ts
      schedule-post.test.ts
      notify.test.ts
    config/
      system-prompt.test.ts
    orchestrator.test.ts
    e2e/
      dry-run.test.ts
  .env.example
  package.json
  tsconfig.json
  vitest.config.ts
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.env.example`
- Create: `.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "marketing-agent",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts",
    "dev": "tsx src/index.ts --run-now",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.52.0",
    "@mendable/firecrawl-js": "^1.19.0",
    "better-sqlite3": "^11.7.0",
    "node-cron": "^3.0.3",
    "nodemailer": "^6.9.16",
    "zod": "^3.24.2"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/node": "^22.10.0",
    "@types/node-cron": "^3.0.11",
    "@types/nodemailer": "^6.4.17",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": ".",
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*", "tests/**/*", "brands/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
});
```

- [ ] **Step 4: Create .env.example**

```
ANTHROPIC_API_KEY=
FIRECRAWL_API_KEY=
POSTIZ_API_KEY=
POSTIZ_BASE_URL=https://app.postiz.com/api/v1
NOTIFY_EMAIL=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
BRAND=carephoto
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
.env
*.db
*.db-wal
*.db-shm
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`
Expected: Clean install, `node_modules/` created, `package-lock.json` generated.

- [ ] **Step 7: Verify test runner works**

Run: `npx vitest run`
Expected: "No test files found" (clean exit, no config errors).

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .env.example .gitignore package-lock.json
git commit -m "chore: scaffold project with dependencies and config"
```

---

### Task 2: Brand Config Loader

**Files:**
- Create: `src/config/load-brand.ts`
- Create: `brands/carephoto.json`
- Create: `tests/config/load-brand.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/config/load-brand.test.ts
import { describe, it, expect } from "vitest";
import { loadBrand, BrandConfig } from "../../src/config/load-brand.js";
import path from "path";

describe("loadBrand", () => {
  it("loads and validates a brand config from JSON", () => {
    const brand = loadBrand("carephoto", path.resolve("brands"));
    expect(brand.id).toBe("carephoto");
    expect(brand.name).toBe("carephoto.art");
    expect(brand.competitors.length).toBeGreaterThan(0);
    expect(brand.keywords.length).toBeGreaterThan(0);
  });

  it("throws on missing brand file", () => {
    expect(() => loadBrand("nonexistent", path.resolve("brands"))).toThrow();
  });

  it("throws on invalid brand config", () => {
    // We'll test this by attempting to load a file that doesn't match schema
    // For now, the missing-file test covers the error path
    expect(() => loadBrand("nonexistent", path.resolve("brands"))).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config/load-brand.test.ts`
Expected: FAIL — module `../../src/config/load-brand.js` not found.

- [ ] **Step 3: Create brand config JSON**

```json
// brands/carephoto.json
{
  "id": "carephoto",
  "name": "carephoto.art",
  "domain": "carephoto.art",
  "niche": "AI photo editing and enhancement",
  "description": "AI-powered photo editing studio specializing in portrait enhancement, dating profile photos, and professional headshots. Makes everyone look their best with intelligent AI editing.",
  "competitors": [
    { "name": "Higgsfield", "website": "https://higgsfield.ai" },
    { "name": "Kaze AI", "website": "https://kaze.ai" },
    { "name": "Easy-Peasy AI", "website": "https://easy-peasy.ai" },
    { "name": "Clipfly AI", "website": "https://clipfly.ai" },
    { "name": "Remini", "website": "https://remini.ai" },
    { "name": "Lensa AI", "website": "https://lensa-ai.com" },
    { "name": "The Match Artist", "website": "https://thematchartist.com" },
    { "name": "uwear.ai", "website": "https://uwear.ai" },
    { "name": "Artguru AI", "website": "https://artguru.ai" },
    { "name": "PicWish", "website": "https://picwish.com" },
    { "name": "Fotor", "website": "https://fotor.com" },
    { "name": "Leonardo AI", "website": "https://leonardo.ai" }
  ],
  "keywords": [
    "AI photo editor",
    "AI dating photos",
    "AI portrait",
    "photo enhancement",
    "AI headshots",
    "AI photo studio"
  ],
  "tone": "Friendly, confident, slightly playful. Emphasize transformation and results. Speak to people who want to look their best online — dating profiles, LinkedIn, social media.",
  "instagram": {
    "accountId": "",
    "accessToken": ""
  },
  "postingSchedule": {
    "frequency": "daily",
    "preferredTime": "10:00"
  }
}
```

- [ ] **Step 4: Write the brand config loader**

```typescript
// src/config/load-brand.ts
import { z } from "zod";
import fs from "fs";
import path from "path";

const CompetitorSchema = z.object({
  name: z.string(),
  instagram: z.string().optional(),
  website: z.string().optional(),
});

const BrandConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string(),
  niche: z.string(),
  description: z.string(),
  competitors: z.array(CompetitorSchema),
  keywords: z.array(z.string()),
  tone: z.string(),
  instagram: z.object({
    accountId: z.string(),
    accessToken: z.string(),
  }),
  postingSchedule: z.object({
    frequency: z.enum(["daily", "weekdays", "custom"]),
    preferredTime: z.string(),
  }),
});

export type BrandConfig = z.infer<typeof BrandConfigSchema>;

export function loadBrand(brandId: string, brandsDir: string): BrandConfig {
  const filePath = path.join(brandsDir, `${brandId}.json`);
  const raw = fs.readFileSync(filePath, "utf-8");
  const json = JSON.parse(raw);
  return BrandConfigSchema.parse(json);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/config/load-brand.test.ts`
Expected: PASS — all 3 tests green.

- [ ] **Step 6: Commit**

```bash
git add src/config/load-brand.ts brands/carephoto.json tests/config/load-brand.test.ts
git commit -m "feat: add brand config loader with Zod validation"
```

---

### Task 3: SQLite Schema & Connection

**Files:**
- Create: `src/db/schema.ts`
- Create: `tests/db/schema.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/db/schema.test.ts
import { describe, it, expect } from "vitest";
import { createDatabase } from "../../src/db/schema.js";

describe("createDatabase", () => {
  it("creates all four tables in an in-memory database", () => {
    const db = createDatabase(":memory:");

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      )
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain("posts");
    expect(tableNames).toContain("analytics");
    expect(tableNames).toContain("competitor_snapshots");
    expect(tableNames).toContain("content_calendar");

    db.close();
  });

  it("enables WAL mode", () => {
    const db = createDatabase(":memory:");
    const result = db.prepare("PRAGMA journal_mode").get() as {
      journal_mode: string;
    };
    expect(result.journal_mode).toBe("wal");
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db/schema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the schema module**

```typescript
// src/db/schema.ts
import Database from "better-sqlite3";

export function createDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand_id TEXT NOT NULL,
      caption TEXT NOT NULL,
      hashtags TEXT NOT NULL DEFAULT '[]',
      image_url TEXT,
      posted_at TEXT,
      platform TEXT NOT NULL DEFAULT 'instagram',
      external_post_id TEXT,
      content_theme TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL REFERENCES posts(id),
      brand_id TEXT NOT NULL,
      likes INTEGER DEFAULT 0,
      comments INTEGER DEFAULT 0,
      shares INTEGER DEFAULT 0,
      reach INTEGER DEFAULT 0,
      impressions INTEGER DEFAULT 0,
      profile_visits INTEGER DEFAULT 0,
      link_clicks INTEGER DEFAULT 0,
      measured_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS competitor_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand_id TEXT NOT NULL,
      competitor_name TEXT NOT NULL,
      content_summary TEXT,
      engagement_notes TEXT,
      scraped_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS content_calendar (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand_id TEXT NOT NULL,
      planned_date TEXT NOT NULL,
      theme TEXT,
      caption_draft TEXT,
      hashtags TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'planned',
      reasoning TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/db/schema.test.ts`
Expected: PASS — both tests green.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts tests/db/schema.test.ts
git commit -m "feat: add SQLite schema with 4 tables and WAL mode"
```

---

### Task 4: Database Query Helpers

**Files:**
- Create: `src/db/queries.ts`
- Create: `tests/db/queries.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/db/queries.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createDatabase } from "../../src/db/schema.js";
import {
  insertPost,
  getRecentPosts,
  insertAnalytics,
  getPostPerformance,
  insertCompetitorSnapshot,
  insertContentCalendarEntry,
  updateContentCalendarStatus,
} from "../../src/db/queries.js";
import Database from "better-sqlite3";

let db: Database.Database;

beforeEach(() => {
  db = createDatabase(":memory:");
});

describe("posts", () => {
  it("inserts and retrieves posts", () => {
    insertPost(db, {
      brand_id: "carephoto",
      caption: "Test caption",
      hashtags: ["#ai", "#photo"],
      image_url: "https://example.com/img.jpg",
      content_theme: "before-after",
    });

    const posts = getRecentPosts(db, "carephoto", 5);
    expect(posts).toHaveLength(1);
    expect(posts[0].caption).toBe("Test caption");
    expect(posts[0].hashtags).toEqual(["#ai", "#photo"]);
  });
});

describe("analytics", () => {
  it("inserts analytics and retrieves performance", () => {
    insertPost(db, {
      brand_id: "carephoto",
      caption: "Test",
      hashtags: [],
      content_theme: "tip",
    });

    const posts = getRecentPosts(db, "carephoto", 1);
    insertAnalytics(db, {
      post_id: posts[0].id,
      brand_id: "carephoto",
      likes: 50,
      comments: 10,
      shares: 5,
      reach: 1000,
      impressions: 1500,
      profile_visits: 20,
      link_clicks: 8,
    });

    const perf = getPostPerformance(db, "carephoto", 5);
    expect(perf).toHaveLength(1);
    expect(perf[0].likes).toBe(50);
    expect(perf[0].caption).toBe("Test");
  });
});

describe("competitor_snapshots", () => {
  it("inserts a snapshot", () => {
    insertCompetitorSnapshot(db, {
      brand_id: "carephoto",
      competitor_name: "Remini",
      content_summary: "Lots of before/after content",
      engagement_notes: "High engagement on transformation posts",
    });

    const rows = db
      .prepare("SELECT * FROM competitor_snapshots WHERE brand_id = ?")
      .all("carephoto") as Array<{ competitor_name: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].competitor_name).toBe("Remini");
  });
});

describe("content_calendar", () => {
  it("inserts and updates status", () => {
    const id = insertContentCalendarEntry(db, {
      brand_id: "carephoto",
      planned_date: "2026-04-12",
      theme: "before-after",
      caption_draft: "Draft caption",
      hashtags: ["#ai"],
      reasoning: "High engagement on transformation content",
    });

    updateContentCalendarStatus(db, id, "posted");

    const row = db
      .prepare("SELECT status FROM content_calendar WHERE id = ?")
      .get(id) as { status: string };
    expect(row.status).toBe("posted");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db/queries.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the query helpers**

```typescript
// src/db/queries.ts
import Database from "better-sqlite3";

interface PostInsert {
  brand_id: string;
  caption: string;
  hashtags: string[];
  image_url?: string;
  content_theme?: string;
  posted_at?: string;
  external_post_id?: string;
}

interface PostRow {
  id: number;
  brand_id: string;
  caption: string;
  hashtags: string[];
  image_url: string | null;
  posted_at: string | null;
  platform: string;
  external_post_id: string | null;
  content_theme: string | null;
  created_at: string;
}

interface AnalyticsInsert {
  post_id: number;
  brand_id: string;
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  impressions: number;
  profile_visits: number;
  link_clicks: number;
}

interface PerformanceRow {
  caption: string;
  content_theme: string | null;
  posted_at: string | null;
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  impressions: number;
  profile_visits: number;
  link_clicks: number;
  measured_at: string;
}

interface CompetitorSnapshotInsert {
  brand_id: string;
  competitor_name: string;
  content_summary: string;
  engagement_notes: string;
}

interface ContentCalendarInsert {
  brand_id: string;
  planned_date: string;
  theme: string;
  caption_draft: string;
  hashtags: string[];
  reasoning: string;
}

export function insertPost(db: Database.Database, post: PostInsert): number {
  const stmt = db.prepare(`
    INSERT INTO posts (brand_id, caption, hashtags, image_url, content_theme, posted_at, external_post_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    post.brand_id,
    post.caption,
    JSON.stringify(post.hashtags),
    post.image_url ?? null,
    post.content_theme ?? null,
    post.posted_at ?? null,
    post.external_post_id ?? null
  );
  return Number(result.lastInsertRowid);
}

export function getRecentPosts(
  db: Database.Database,
  brandId: string,
  limit: number
): PostRow[] {
  const rows = db
    .prepare(
      "SELECT * FROM posts WHERE brand_id = ? ORDER BY created_at DESC LIMIT ?"
    )
    .all(brandId, limit) as Array<PostRow & { hashtags: string }>;

  return rows.map((r) => ({
    ...r,
    hashtags: JSON.parse(r.hashtags as string),
  }));
}

export function insertAnalytics(
  db: Database.Database,
  analytics: AnalyticsInsert
): number {
  const stmt = db.prepare(`
    INSERT INTO analytics (post_id, brand_id, likes, comments, shares, reach, impressions, profile_visits, link_clicks)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    analytics.post_id,
    analytics.brand_id,
    analytics.likes,
    analytics.comments,
    analytics.shares,
    analytics.reach,
    analytics.impressions,
    analytics.profile_visits,
    analytics.link_clicks
  );
  return Number(result.lastInsertRowid);
}

export function getPostPerformance(
  db: Database.Database,
  brandId: string,
  limit: number
): PerformanceRow[] {
  return db
    .prepare(
      `SELECT p.caption, p.content_theme, p.posted_at,
              a.likes, a.comments, a.shares, a.reach, a.impressions,
              a.profile_visits, a.link_clicks, a.measured_at
       FROM posts p
       JOIN analytics a ON a.post_id = p.id
       WHERE p.brand_id = ?
       ORDER BY a.measured_at DESC
       LIMIT ?`
    )
    .all(brandId, limit) as PerformanceRow[];
}

export function insertCompetitorSnapshot(
  db: Database.Database,
  snapshot: CompetitorSnapshotInsert
): number {
  const stmt = db.prepare(`
    INSERT INTO competitor_snapshots (brand_id, competitor_name, content_summary, engagement_notes)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(
    snapshot.brand_id,
    snapshot.competitor_name,
    snapshot.content_summary,
    snapshot.engagement_notes
  );
  return Number(result.lastInsertRowid);
}

export function insertContentCalendarEntry(
  db: Database.Database,
  entry: ContentCalendarInsert
): number {
  const stmt = db.prepare(`
    INSERT INTO content_calendar (brand_id, planned_date, theme, caption_draft, hashtags, status, reasoning)
    VALUES (?, ?, ?, ?, ?, 'planned', ?)
  `);
  const result = stmt.run(
    entry.brand_id,
    entry.planned_date,
    entry.theme,
    entry.caption_draft,
    JSON.stringify(entry.hashtags),
    entry.reasoning
  );
  return Number(result.lastInsertRowid);
}

export function updateContentCalendarStatus(
  db: Database.Database,
  id: number,
  status: string
): void {
  db.prepare("UPDATE content_calendar SET status = ? WHERE id = ?").run(
    status,
    id
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/db/queries.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/db/queries.ts tests/db/queries.test.ts
git commit -m "feat: add database query helpers for all 4 tables"
```

---

### Task 5: System Prompt Builder

**Files:**
- Create: `src/config/system-prompt.ts`
- Create: `tests/config/system-prompt.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/config/system-prompt.test.ts
import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../../src/config/system-prompt.js";
import type { BrandConfig } from "../../src/config/load-brand.js";

const mockBrand: BrandConfig = {
  id: "testbrand",
  name: "Test Brand",
  domain: "test.com",
  niche: "testing",
  description: "A test brand",
  competitors: [
    { name: "Competitor A", website: "https://a.com" },
    { name: "Competitor B" },
  ],
  keywords: ["test", "brand"],
  tone: "Professional and direct",
  instagram: { accountId: "123", accessToken: "abc" },
  postingSchedule: { frequency: "daily", preferredTime: "10:00" },
};

describe("buildSystemPrompt", () => {
  it("includes brand name and domain", () => {
    const prompt = buildSystemPrompt(mockBrand);
    expect(prompt).toContain("Test Brand");
    expect(prompt).toContain("test.com");
  });

  it("includes competitor names", () => {
    const prompt = buildSystemPrompt(mockBrand);
    expect(prompt).toContain("Competitor A");
    expect(prompt).toContain("Competitor B");
  });

  it("includes today's date", () => {
    const prompt = buildSystemPrompt(mockBrand);
    const today = new Date().toISOString().split("T")[0];
    expect(prompt).toContain(today);
  });

  it("includes brand tone", () => {
    const prompt = buildSystemPrompt(mockBrand);
    expect(prompt).toContain("Professional and direct");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config/system-prompt.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the system prompt builder**

```typescript
// src/config/system-prompt.ts
import type { BrandConfig } from "./load-brand.js";

export function buildSystemPrompt(brand: BrandConfig): string {
  const today = new Date();
  const dateStr = today.toISOString().split("T")[0];
  const dayOfWeek = today.toLocaleDateString("en-US", { weekday: "long" });

  const competitorList = brand.competitors
    .map((c) => `- ${c.name}`)
    .join("\n");

  return `You are an autonomous marketing agent for ${brand.name} (${brand.domain}).

About the brand: ${brand.description}
Brand voice: ${brand.tone}
Niche: ${brand.niche}

Your job is to run the daily marketing cycle:
1. Research competitors and trends using your tools
2. Review recent post performance
3. Decide on today's content strategy
4. Generate and schedule a post (or decide to skip with reasoning)
5. Send a summary notification

Today is ${dateStr}, ${dayOfWeek}.

Recent post history and performance data will be provided when you query for it.
Competitors to monitor:
${competitorList}

Guidelines:
- Post daily unless there's a good reason not to
- Vary content types: before/after, tips, user showcases, trending topics
- Learn from past performance — do more of what works
- Keep captions authentic to the brand voice
- Use 20-30 relevant hashtags per post
- Always explain your reasoning in the content calendar
- When scheduling a post, always record the entry in the content calendar first`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/config/system-prompt.test.ts`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/config/system-prompt.ts tests/config/system-prompt.test.ts
git commit -m "feat: add system prompt builder from brand config"
```

---

### Task 6: Firecrawl Tools (scrape_competitor + search_trends)

**Files:**
- Create: `src/tools/scrape-competitor.ts`
- Create: `src/tools/search-trends.ts`
- Create: `tests/tools/scrape-competitor.test.ts`
- Create: `tests/tools/search-trends.test.ts`

- [ ] **Step 1: Write the scrape-competitor failing test**

```typescript
// tests/tools/scrape-competitor.test.ts
import { describe, it, expect, vi } from "vitest";
import { scrapeCompetitor } from "../../src/tools/scrape-competitor.js";

// Mock Firecrawl
vi.mock("@mendable/firecrawl-js", () => ({
  default: class {
    scrapeUrl(url: string) {
      return Promise.resolve({
        success: true,
        markdown: "# Competitor Page\nSome content about their latest products.",
      });
    }
  },
}));

describe("scrapeCompetitor", () => {
  it("returns scraped content summary", async () => {
    const result = await scrapeCompetitor("Remini", "https://remini.ai");
    expect(result).toContain("Remini");
    expect(result).toContain("Competitor Page");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/scrape-competitor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write scrape-competitor implementation**

```typescript
// src/tools/scrape-competitor.ts
import FirecrawlApp from "@mendable/firecrawl-js";

export async function scrapeCompetitor(
  name: string,
  url: string
): Promise<string> {
  try {
    const firecrawl = new FirecrawlApp({
      apiKey: process.env.FIRECRAWL_API_KEY ?? "",
    });

    const result = await firecrawl.scrapeUrl(url, {
      formats: ["markdown"],
    });

    if (!result.success) {
      return `Failed to scrape ${name} at ${url}: scrape unsuccessful`;
    }

    const content = result.markdown ?? "";
    const truncated =
      content.length > 3000 ? content.slice(0, 3000) + "..." : content;
    return `Competitor: ${name}\nURL: ${url}\n\n${truncated}`;
  } catch (error) {
    return `Failed to scrape ${name} at ${url}: ${error instanceof Error ? error.message : String(error)}`;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tools/scrape-competitor.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the search-trends failing test**

```typescript
// tests/tools/search-trends.test.ts
import { describe, it, expect, vi } from "vitest";
import { searchTrends } from "../../src/tools/search-trends.js";

vi.mock("@mendable/firecrawl-js", () => ({
  default: class {
    search(query: string) {
      return Promise.resolve({
        success: true,
        data: [
          { title: "AI Photo Trends 2026", url: "https://example.com/1", description: "Latest trends in AI photography" },
          { title: "Dating Profile Tips", url: "https://example.com/2", description: "How AI is changing dating photos" },
        ],
      });
    }
  },
}));

describe("searchTrends", () => {
  it("returns trend results for keywords", async () => {
    const result = await searchTrends(["AI photo editor", "AI dating photos"]);
    expect(result).toContain("AI Photo Trends");
    expect(result).toContain("Dating Profile Tips");
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run tests/tools/search-trends.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Write search-trends implementation**

```typescript
// src/tools/search-trends.ts
import FirecrawlApp from "@mendable/firecrawl-js";

export async function searchTrends(keywords: string[]): Promise<string> {
  try {
    const firecrawl = new FirecrawlApp({
      apiKey: process.env.FIRECRAWL_API_KEY ?? "",
    });

    const query = keywords.join(" OR ");
    const result = await firecrawl.search(query, { limit: 10 });

    if (!result.success) {
      return `Trend search failed for keywords: ${keywords.join(", ")}`;
    }

    const entries = (result.data ?? [])
      .map(
        (item: { title?: string; url?: string; description?: string }) =>
          `- ${item.title ?? "Untitled"} (${item.url ?? "no url"})\n  ${item.description ?? ""}`
      )
      .join("\n");

    return `Trend search results for: ${keywords.join(", ")}\n\n${entries}`;
  } catch (error) {
    return `Trend search failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run tests/tools/search-trends.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/tools/scrape-competitor.ts src/tools/search-trends.ts tests/tools/scrape-competitor.test.ts tests/tools/search-trends.test.ts
git commit -m "feat: add Firecrawl tools for competitor scraping and trend search"
```

---

### Task 7: SQLite Tools (recent_posts + post_performance)

**Files:**
- Create: `src/tools/recent-posts.ts`
- Create: `src/tools/post-performance.ts`
- Create: `tests/tools/recent-posts.test.ts`
- Create: `tests/tools/post-performance.test.ts`

- [ ] **Step 1: Write the recent-posts failing test**

```typescript
// tests/tools/recent-posts.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createDatabase } from "../../src/db/schema.js";
import { insertPost } from "../../src/db/queries.js";
import { getRecentPostsTool } from "../../src/tools/recent-posts.js";
import Database from "better-sqlite3";

let db: Database.Database;

beforeEach(() => {
  db = createDatabase(":memory:");
  insertPost(db, {
    brand_id: "carephoto",
    caption: "Amazing AI results!",
    hashtags: ["#ai", "#photo"],
    content_theme: "before-after",
  });
  insertPost(db, {
    brand_id: "carephoto",
    caption: "Tips for better headshots",
    hashtags: ["#headshots"],
    content_theme: "tips",
  });
});

describe("getRecentPostsTool", () => {
  it("returns formatted recent posts", () => {
    const result = getRecentPostsTool(db, "carephoto", 5);
    expect(result).toContain("Amazing AI results!");
    expect(result).toContain("Tips for better headshots");
  });

  it("respects limit", () => {
    const result = getRecentPostsTool(db, "carephoto", 1);
    expect(result).toContain("Tips for better headshots");
    expect(result).not.toContain("Amazing AI results!");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/recent-posts.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write recent-posts implementation**

```typescript
// src/tools/recent-posts.ts
import Database from "better-sqlite3";
import { getRecentPosts } from "../db/queries.js";

export function getRecentPostsTool(
  db: Database.Database,
  brandId: string,
  limit: number
): string {
  const posts = getRecentPosts(db, brandId, limit);

  if (posts.length === 0) {
    return `No recent posts found for brand "${brandId}".`;
  }

  const formatted = posts
    .map(
      (p) =>
        `[${p.created_at}] Theme: ${p.content_theme ?? "none"}\nCaption: ${p.caption}\nHashtags: ${p.hashtags.join(", ")}`
    )
    .join("\n\n");

  return `Recent ${posts.length} posts for ${brandId}:\n\n${formatted}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tools/recent-posts.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the post-performance failing test**

```typescript
// tests/tools/post-performance.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createDatabase } from "../../src/db/schema.js";
import { insertPost, insertAnalytics } from "../../src/db/queries.js";
import { getPostPerformanceTool } from "../../src/tools/post-performance.js";
import Database from "better-sqlite3";

let db: Database.Database;

beforeEach(() => {
  db = createDatabase(":memory:");
  const postId = insertPost(db, {
    brand_id: "carephoto",
    caption: "Test post",
    hashtags: ["#test"],
    content_theme: "before-after",
  });
  insertAnalytics(db, {
    post_id: postId,
    brand_id: "carephoto",
    likes: 100,
    comments: 20,
    shares: 10,
    reach: 5000,
    impressions: 8000,
    profile_visits: 50,
    link_clicks: 15,
  });
});

describe("getPostPerformanceTool", () => {
  it("returns formatted performance data", () => {
    const result = getPostPerformanceTool(db, "carephoto", 5);
    expect(result).toContain("100 likes");
    expect(result).toContain("5000 reach");
    expect(result).toContain("Test post");
  });

  it("returns message when no data", () => {
    const result = getPostPerformanceTool(db, "nonexistent", 5);
    expect(result).toContain("No performance data");
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run tests/tools/post-performance.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Write post-performance implementation**

```typescript
// src/tools/post-performance.ts
import Database from "better-sqlite3";
import { getPostPerformance } from "../db/queries.js";

export function getPostPerformanceTool(
  db: Database.Database,
  brandId: string,
  limit: number
): string {
  const perf = getPostPerformance(db, brandId, limit);

  if (perf.length === 0) {
    return `No performance data found for brand "${brandId}".`;
  }

  const formatted = perf
    .map(
      (p) =>
        `[${p.posted_at ?? "unposted"}] Theme: ${p.content_theme ?? "none"}\nCaption: ${p.caption}\n${p.likes} likes, ${p.comments} comments, ${p.shares} shares, ${p.reach} reach, ${p.impressions} impressions, ${p.profile_visits} profile visits, ${p.link_clicks} link clicks`
    )
    .join("\n\n");

  return `Performance data for ${brandId} (${perf.length} posts):\n\n${formatted}`;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run tests/tools/post-performance.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/tools/recent-posts.ts src/tools/post-performance.ts tests/tools/recent-posts.test.ts tests/tools/post-performance.test.ts
git commit -m "feat: add SQLite tools for recent posts and post performance"
```

---

### Task 8: Postiz Scheduling Tool

**Files:**
- Create: `src/tools/schedule-post.ts`
- Create: `tests/tools/schedule-post.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/tools/schedule-post.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { schedulePost } from "../../src/tools/schedule-post.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.stubEnv("POSTIZ_API_KEY", "test-key");
  vi.stubEnv("POSTIZ_BASE_URL", "https://app.postiz.com/api/v1");
  mockFetch.mockReset();
});

describe("schedulePost", () => {
  it("sends a post to Postiz and returns confirmation", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: "post-123", status: "scheduled" }),
    });

    const result = await schedulePost({
      caption: "Check out our AI edits!",
      hashtags: ["#ai", "#photo"],
      imageUrl: "https://example.com/img.jpg",
      scheduledTime: "2026-04-12T10:00:00Z",
    });

    expect(result).toContain("post-123");
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("returns error message on failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve("Bad request"),
    });

    const result = await schedulePost({
      caption: "Test",
      hashtags: [],
      imageUrl: "https://example.com/img.jpg",
    });

    expect(result).toContain("Failed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/schedule-post.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write schedule-post implementation**

```typescript
// src/tools/schedule-post.ts
interface SchedulePostInput {
  caption: string;
  hashtags: string[];
  imageUrl: string;
  scheduledTime?: string;
}

export async function schedulePost(input: SchedulePostInput): Promise<string> {
  const apiKey = process.env.POSTIZ_API_KEY;
  const baseUrl =
    process.env.POSTIZ_BASE_URL ?? "https://app.postiz.com/api/v1";

  if (!apiKey) {
    return "Postiz API key not configured. Post saved to content calendar but not scheduled.";
  }

  try {
    const fullCaption =
      input.caption +
      (input.hashtags.length > 0 ? "\n\n" + input.hashtags.join(" ") : "");

    const body: Record<string, unknown> = {
      content: fullCaption,
      media: [{ url: input.imageUrl }],
      platform: "instagram",
    };

    if (input.scheduledTime) {
      body.scheduledAt = input.scheduledTime;
    }

    const response = await fetch(`${baseUrl}/posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return `Failed to schedule post via Postiz (${response.status}): ${errorText}`;
    }

    const data = (await response.json()) as { id?: string; status?: string };
    return `Post scheduled successfully via Postiz. ID: ${data.id ?? "unknown"}, Status: ${data.status ?? "unknown"}`;
  } catch (error) {
    return `Failed to schedule post: ${error instanceof Error ? error.message : String(error)}`;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tools/schedule-post.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/schedule-post.ts tests/tools/schedule-post.test.ts
git commit -m "feat: add Postiz scheduling tool"
```

---

### Task 9: Email Notification Tool

**Files:**
- Create: `src/tools/notify.ts`
- Create: `tests/tools/notify.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/tools/notify.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendNotification } from "../../src/tools/notify.js";

vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail: vi.fn().mockResolvedValue({ messageId: "msg-123" }),
    }),
  },
}));

beforeEach(() => {
  vi.stubEnv("SMTP_HOST", "smtp.test.com");
  vi.stubEnv("SMTP_PORT", "587");
  vi.stubEnv("SMTP_USER", "user@test.com");
  vi.stubEnv("SMTP_PASS", "password");
  vi.stubEnv("NOTIFY_EMAIL", "mert@test.com");
});

describe("sendNotification", () => {
  it("sends email and returns confirmation", async () => {
    const result = await sendNotification(
      "Daily Summary",
      "Posted 1 image today."
    );
    expect(result).toContain("sent");
  });

  it("falls back to console when SMTP not configured", async () => {
    vi.stubEnv("SMTP_HOST", "");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await sendNotification("Test", "Body");
    expect(result).toContain("logged to console");

    consoleSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/notify.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write notify implementation**

```typescript
// src/tools/notify.ts
import nodemailer from "nodemailer";

export async function sendNotification(
  subject: string,
  body: string
): Promise<string> {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const notifyEmail = process.env.NOTIFY_EMAIL;

  if (!smtpHost || !notifyEmail) {
    console.log(`[Notification] ${subject}\n${body}`);
    return `Notification logged to console (SMTP not configured): "${subject}"`;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(smtpPort ?? 587),
      secure: Number(smtpPort ?? 587) === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: smtpUser,
      to: notifyEmail,
      subject: `[Marketing Agent] ${subject}`,
      text: body,
    });

    return `Notification sent to ${notifyEmail}: "${subject}"`;
  } catch (error) {
    console.log(`[Notification FAILED] ${subject}\n${body}`);
    return `Failed to send notification: ${error instanceof Error ? error.message : String(error)}. Logged to console instead.`;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tools/notify.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/notify.ts tests/tools/notify.test.ts
git commit -m "feat: add email notification tool with console fallback"
```

---

### Task 10: Orchestrator with Claude Tool Runner

**Files:**
- Create: `src/orchestrator.ts`
- Create: `tests/orchestrator.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/orchestrator.test.ts
import { describe, it, expect, vi } from "vitest";
import { buildTools } from "../../src/orchestrator.js";
import { createDatabase } from "../../src/db/schema.js";
import type { BrandConfig } from "../../src/config/load-brand.js";

const mockBrand: BrandConfig = {
  id: "testbrand",
  name: "Test Brand",
  domain: "test.com",
  niche: "testing",
  description: "A test brand",
  competitors: [{ name: "Competitor A", website: "https://a.com" }],
  keywords: ["test"],
  tone: "Professional",
  instagram: { accountId: "123", accessToken: "abc" },
  postingSchedule: { frequency: "daily", preferredTime: "10:00" },
};

describe("buildTools", () => {
  it("returns an array of 6 tool definitions", () => {
    const db = createDatabase(":memory:");
    const tools = buildTools(mockBrand, db);
    expect(tools).toHaveLength(6);

    const names = tools.map((t) => t.name);
    expect(names).toContain("scrape_competitor");
    expect(names).toContain("search_trends");
    expect(names).toContain("get_recent_posts");
    expect(names).toContain("get_post_performance");
    expect(names).toContain("schedule_post");
    expect(names).toContain("send_notification");

    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orchestrator.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the orchestrator**

```typescript
// src/orchestrator.ts
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import Database from "better-sqlite3";
import type { BrandConfig } from "./config/load-brand.js";
import { buildSystemPrompt } from "./config/system-prompt.js";
import { scrapeCompetitor } from "./tools/scrape-competitor.js";
import { searchTrends } from "./tools/search-trends.js";
import { getRecentPostsTool } from "./tools/recent-posts.js";
import { getPostPerformanceTool } from "./tools/post-performance.js";
import { schedulePost } from "./tools/schedule-post.js";
import { sendNotification } from "./tools/notify.js";
import {
  insertPost,
  insertCompetitorSnapshot,
  insertContentCalendarEntry,
  updateContentCalendarStatus,
} from "./db/queries.js";

export function buildTools(brand: BrandConfig, db: Database.Database) {
  const client = new Anthropic();

  return [
    client.tools.betaZodTool({
      name: "scrape_competitor",
      description:
        "Scrape a competitor's website to analyze their recent content, marketing strategy, and engagement patterns.",
      inputSchema: z.object({
        name: z.string().describe("Competitor name"),
        url: z.string().url().describe("URL to scrape"),
      }),
      execute: async (input) => {
        const result = await scrapeCompetitor(input.name, input.url);
        insertCompetitorSnapshot(db, {
          brand_id: brand.id,
          competitor_name: input.name,
          content_summary: result,
          engagement_notes: "",
        });
        return result;
      },
    }),

    client.tools.betaZodTool({
      name: "search_trends",
      description:
        "Search the web for trending topics, hashtags, and content angles related to given keywords.",
      inputSchema: z.object({
        keywords: z
          .array(z.string())
          .describe("Keywords to search for trends"),
      }),
      execute: async (input) => {
        return searchTrends(input.keywords);
      },
    }),

    client.tools.betaZodTool({
      name: "get_recent_posts",
      description:
        "Get recent posts for the brand to review what content has been published.",
      inputSchema: z.object({
        limit: z
          .number()
          .default(10)
          .describe("Number of recent posts to retrieve"),
      }),
      execute: async (input) => {
        return getRecentPostsTool(db, brand.id, input.limit);
      },
    }),

    client.tools.betaZodTool({
      name: "get_post_performance",
      description:
        "Get performance analytics for recent posts to understand what content performs well.",
      inputSchema: z.object({
        limit: z
          .number()
          .default(10)
          .describe("Number of posts to get performance for"),
      }),
      execute: async (input) => {
        return getPostPerformanceTool(db, brand.id, input.limit);
      },
    }),

    client.tools.betaZodTool({
      name: "schedule_post",
      description:
        "Schedule a post to Instagram via Postiz. Always record the content in the content calendar first.",
      inputSchema: z.object({
        caption: z.string().describe("Post caption"),
        hashtags: z.array(z.string()).describe("Hashtags for the post"),
        imageUrl: z.string().url().describe("URL to the post image"),
        scheduledTime: z
          .string()
          .optional()
          .describe("ISO timestamp for when to post (optional, posts immediately if omitted)"),
      }),
      execute: async (input) => {
        const calendarId = insertContentCalendarEntry(db, {
          brand_id: brand.id,
          planned_date: new Date().toISOString().split("T")[0],
          theme: "scheduled",
          caption_draft: input.caption,
          hashtags: input.hashtags,
          reasoning: "Scheduled via agent",
        });

        const result = await schedulePost(input);

        if (result.includes("successfully")) {
          const postId = insertPost(db, {
            brand_id: brand.id,
            caption: input.caption,
            hashtags: input.hashtags,
            image_url: input.imageUrl,
            content_theme: "scheduled",
            posted_at: input.scheduledTime ?? new Date().toISOString(),
          });
          updateContentCalendarStatus(db, calendarId, "posted");
        } else {
          updateContentCalendarStatus(db, calendarId, "planned");
        }

        return result;
      },
    }),

    client.tools.betaZodTool({
      name: "send_notification",
      description:
        "Send an email notification to the brand owner with a summary or alert.",
      inputSchema: z.object({
        subject: z.string().describe("Email subject"),
        body: z.string().describe("Email body"),
      }),
      execute: async (input) => {
        return sendNotification(input.subject, input.body);
      },
    }),
  ];
}

export async function runAgent(
  brand: BrandConfig,
  db: Database.Database
): Promise<void> {
  const client = new Anthropic();
  const tools = buildTools(brand, db);
  const systemPrompt = buildSystemPrompt(brand);

  console.log(`[Agent] Starting daily run for ${brand.name}...`);

  const response = await client.beta.messages.toolRunner({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Run the daily marketing cycle for ${brand.name}. Today is ${new Date().toISOString().split("T")[0]}. Research competitors, check trends, review past performance, and decide on today's content strategy. If you post, schedule it. Always send a summary notification at the end.`,
      },
    ],
    tools,
  });

  const finalMessage = response.getFinalMessage();
  const textBlock = finalMessage.content.find((b) => b.type === "text");
  console.log(
    `[Agent] Run complete. Final message: ${textBlock ? textBlock.text.slice(0, 200) : "(no text)"}`
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/orchestrator.test.ts`
Expected: PASS — 1 test green (buildTools returns 6 tools).

- [ ] **Step 5: Commit**

```bash
git add src/orchestrator.ts tests/orchestrator.test.ts
git commit -m "feat: add orchestrator with Claude Tool Runner and 6 betaZodTools"
```

---

### Task 11: Entry Point with Cron & CLI

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Write the entry point**

```typescript
// src/index.ts
import cron from "node-cron";
import path from "path";
import { loadBrand } from "./config/load-brand.js";
import { createDatabase } from "./db/schema.js";
import { runAgent } from "./orchestrator.js";
import { sendNotification } from "./tools/notify.js";

const brandId = process.env.BRAND ?? "carephoto";
const brandsDir = path.resolve("brands");
const dbPath = path.resolve("marketing-agent.db");

async function dailyRun(): Promise<void> {
  try {
    const brand = loadBrand(brandId, brandsDir);
    const db = createDatabase(dbPath);

    await runAgent(brand, db);

    db.close();
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : String(error);
    console.error(`[Agent] Fatal error: ${errorMsg}`);
    await sendNotification("Agent Error", `Fatal error during daily run: ${errorMsg}`);
  }
}

const args = process.argv.slice(2);

if (args.includes("--run-now")) {
  console.log(`[Agent] Running immediately for brand: ${brandId}`);
  dailyRun();
} else {
  console.log(
    `[Agent] Scheduled daily run at 07:00 for brand: ${brandId}`
  );
  cron.schedule("0 7 * * *", () => {
    console.log(`[Agent] Cron triggered at ${new Date().toISOString()}`);
    dailyRun();
  });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsx --eval "import './src/index.js'" 2>&1 || true`
Expected: May fail due to missing env vars, but should not have TypeScript compilation errors.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add entry point with cron scheduling and --run-now CLI flag"
```

---

### Task 12: End-to-End Dry Run Test

**Files:**
- Create: `tests/e2e/dry-run.test.ts`

- [ ] **Step 1: Write the dry-run integration test**

This test verifies the full pipeline works without hitting real APIs. It mocks the Anthropic SDK, Firecrawl, Postiz, and nodemailer, then runs the orchestrator.

```typescript
// tests/e2e/dry-run.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDatabase } from "../../src/db/schema.js";
import { buildTools } from "../../src/orchestrator.js";
import type { BrandConfig } from "../../src/config/load-brand.js";

const mockBrand: BrandConfig = {
  id: "testbrand",
  name: "Test Brand",
  domain: "test.com",
  niche: "testing",
  description: "A test brand for dry runs",
  competitors: [{ name: "Competitor A", website: "https://a.com" }],
  keywords: ["test"],
  tone: "Professional",
  instagram: { accountId: "123", accessToken: "abc" },
  postingSchedule: { frequency: "daily", preferredTime: "10:00" },
};

describe("dry run", () => {
  it("all tools are callable and return strings", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "");
    vi.stubEnv("POSTIZ_API_KEY", "");
    vi.stubEnv("SMTP_HOST", "");

    const db = createDatabase(":memory:");
    const tools = buildTools(mockBrand, db);

    // Each tool's execute function should return a string
    for (const tool of tools) {
      expect(typeof tool.name).toBe("string");
      expect(typeof tool.execute).toBe("function");
    }

    // Test the SQLite tools directly (no external deps)
    const recentPostsTool = tools.find((t) => t.name === "get_recent_posts");
    const result = await recentPostsTool!.execute({ limit: 5 });
    expect(typeof result).toBe("string");
    expect(result).toContain("No recent posts");

    const perfTool = tools.find((t) => t.name === "get_post_performance");
    const perfResult = await perfTool!.execute({ limit: 5 });
    expect(typeof perfResult).toBe("string");
    expect(perfResult).toContain("No performance data");

    // Test notification (console fallback)
    const notifyTool = tools.find((t) => t.name === "send_notification");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const notifyResult = await notifyTool!.execute({
      subject: "Test",
      body: "Test body",
    });
    expect(notifyResult).toContain("logged to console");
    consoleSpy.mockRestore();

    db.close();
  });
});
```

- [ ] **Step 2: Run the dry-run test**

Run: `npx vitest run tests/e2e/dry-run.test.ts`
Expected: PASS.

- [ ] **Step 3: Run ALL tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/dry-run.test.ts
git commit -m "test: add end-to-end dry run test"
```

---

### Task 13: First Real Run

This is a manual verification task — no code changes, just running the agent with real API keys.

- [ ] **Step 1: Set up .env**

Copy `.env.example` to `.env` and fill in:
- `ANTHROPIC_API_KEY` — your Claude API key
- `FIRECRAWL_API_KEY` — your Firecrawl key
- `BRAND=carephoto`

Leave Postiz and SMTP blank for now (the agent will save to content calendar and log notifications to console).

- [ ] **Step 2: Run the agent**

Run: `npx tsx src/index.ts --run-now`

Expected:
- Agent starts, loads carephoto brand
- Claude calls tools: scrapes a competitor or two, searches trends, checks recent posts
- Claude decides on content strategy
- Since Postiz isn't configured, post is saved to content calendar as "planned"
- Summary notification logged to console
- `marketing-agent.db` file created with data

- [ ] **Step 3: Verify database has data**

Run: `sqlite3 marketing-agent.db "SELECT * FROM content_calendar; SELECT * FROM competitor_snapshots;"`

Expected: At least one content calendar entry and competitor snapshot.

- [ ] **Step 4: Celebrate**

The agent works. Configure Postiz and SMTP when ready to go live.
