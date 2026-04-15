# Image Branding & Carousel System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable image branding overlays and multi-slide carousel support to the marketing agent.

**Architecture:** Two new tools (`brand_image`, `brand_carousel`) compose overlays onto images using `sharp`. The `schedule_post` tool is updated to accept multiple images for carousel posts. All branding config lives in the brand directory alongside assets. Branding is optional — when disabled, tools aren't registered.

**Tech Stack:** sharp (image compositing), existing zod/betaZodTool pattern, TypeScript

---

### File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `brands/carephoto/brand.json` | Moved from `brands/carephoto.json`, new fields added |
| Create | `brands/carephoto/assets/logo.png` | Copied from lula repo |
| Modify | `src/config/load-brand.ts` | Add branding/carousel/instagramHandle to schema, resolve brand directory paths |
| Create | `src/tools/brand-image.ts` | Core branding function — download image, resize, composite overlays via sharp |
| Modify | `src/tools/schedule-post.ts` | Change `imageUrl: string` → `images: string[]`, support carousel upload |
| Modify | `src/orchestrator.ts` | Register brand_image + brand_carousel tools conditionally |
| Modify | `src/config/system-prompt.ts` | Add carousel decision logic, thumbnail strategy, branding instructions |
| Create | `tests/tools/brand-image.test.ts` | Tests for the branding pipeline |
| Modify | `tests/tools/schedule-post.test.ts` | Update tests for images[] interface |
| Modify | `tests/config/system-prompt.test.ts` | Test new prompt sections |
| Modify | `tests/orchestrator.test.ts` | Test conditional tool registration |
| Modify | `tests/e2e/dry-run.test.ts` | Update mockBrand, test branding tools |
| Modify | `.gitignore` | Add `.superpowers/` and `tmp/` |

---

### Task 1: Install sharp and update .gitignore

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Install sharp**

```bash
npm install sharp
npm install --save-dev @types/sharp
```

- [ ] **Step 2: Add tmp/ and .superpowers/ to .gitignore**

Append to `.gitignore`:

```
.superpowers/
tmp/
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: add sharp dependency and update gitignore"
```

---

### Task 2: Restructure brand directory and update config schema

**Files:**
- Create: `brands/carephoto/brand.json`
- Create: `brands/carephoto/assets/logo.png`
- Delete: `brands/carephoto.json`
- Modify: `src/config/load-brand.ts`
- Test: `tests/config/system-prompt.test.ts`

- [ ] **Step 1: Write the failing test for new schema fields**

Add to `tests/config/system-prompt.test.ts` — a new test that verifies the new BrandConfig type accepts the new fields:

```typescript
import { loadBrand } from "../../src/config/load-brand.js";
import fs from "fs";
import path from "path";
import os from "os";

describe("loadBrand", () => {
  it("loads brand from directory with branding and carousel config", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "brand-test-"));
    const brandDir = path.join(tmpDir, "testbrand");
    fs.mkdirSync(brandDir, { recursive: true });
    fs.mkdirSync(path.join(brandDir, "assets"), { recursive: true });
    // Create a minimal logo file
    fs.writeFileSync(path.join(brandDir, "assets", "logo.png"), "fake-png");

    const config = {
      id: "testbrand",
      name: "Test Brand",
      domain: "test.com",
      niche: "testing",
      description: "A test brand",
      competitors: [{ name: "Comp A" }],
      keywords: ["test"],
      tone: "Professional",
      postingSchedule: { frequency: "daily", preferredTime: "10:00" },
      instagramHandle: "testbrand",
      branding: {
        enabled: true,
        logoPath: "assets/logo.png",
        showLogo: true,
        showHandle: true,
        showPageIndicator: true,
        showSwipeArrow: true,
      },
      carousel: {
        preferCarousel: true,
        frequency: 0.4,
        maxSlides: 10,
        minSlides: 2,
      },
    };

    fs.writeFileSync(
      path.join(brandDir, "brand.json"),
      JSON.stringify(config)
    );

    const brand = loadBrand("testbrand", tmpDir);
    expect(brand.instagramHandle).toBe("testbrand");
    expect(brand.branding?.enabled).toBe(true);
    expect(brand.branding?.logoPath).toBe("assets/logo.png");
    expect(brand.carousel?.frequency).toBe(0.4);
    expect(brand.brandDir).toBe(brandDir);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("loads brand without branding config (optional)", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "brand-test-"));
    const brandDir = path.join(tmpDir, "minimal");
    fs.mkdirSync(brandDir, { recursive: true });

    const config = {
      id: "minimal",
      name: "Minimal Brand",
      domain: "min.com",
      niche: "testing",
      description: "No branding",
      competitors: [],
      keywords: [],
      tone: "Neutral",
      postingSchedule: { frequency: "daily", preferredTime: "10:00" },
    };

    fs.writeFileSync(
      path.join(brandDir, "brand.json"),
      JSON.stringify(config)
    );

    const brand = loadBrand("minimal", tmpDir);
    expect(brand.branding).toBeUndefined();
    expect(brand.carousel).toBeUndefined();
    expect(brand.instagramHandle).toBeUndefined();

    fs.rmSync(tmpDir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/config/system-prompt.test.ts
```

Expected: FAIL — `loadBrand` looks for `testbrand.json` not `testbrand/brand.json`, and schema rejects new fields.

- [ ] **Step 3: Update the BrandConfig schema and loadBrand function**

Replace `src/config/load-brand.ts` with:

```typescript
import { z } from "zod";
import fs from "fs";
import path from "path";

const CompetitorSchema = z.object({
  name: z.string(),
  instagram: z.string().optional(),
  website: z.string().optional(),
});

const BrandingSchema = z.object({
  enabled: z.boolean(),
  logoPath: z.string(),
  showLogo: z.boolean().default(true),
  showHandle: z.boolean().default(true),
  showPageIndicator: z.boolean().default(true),
  showSwipeArrow: z.boolean().default(true),
});

const CarouselSchema = z.object({
  preferCarousel: z.boolean().default(true),
  frequency: z.number().min(0).max(1).default(0.4),
  maxSlides: z.number().min(2).max(10).default(10),
  minSlides: z.number().min(2).max(10).default(2),
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
  postingSchedule: z.object({
    frequency: z.enum(["daily", "weekdays", "custom"]),
    preferredTime: z.string(),
  }),
  promptBankPath: z.string().optional(),
  instagramHandle: z.string().optional(),
  branding: BrandingSchema.optional(),
  carousel: CarouselSchema.optional(),
});

type BrandConfigRaw = z.infer<typeof BrandConfigSchema>;

export type BrandConfig = BrandConfigRaw & {
  brandDir: string;
};

export function loadBrand(brandId: string, brandsDir: string): BrandConfig {
  const brandDir = path.join(brandsDir, brandId);
  const filePath = path.join(brandDir, "brand.json");

  if (!fs.existsSync(filePath)) {
    // Fallback: try legacy flat file (brands/brandId.json)
    const legacyPath = path.join(brandsDir, `${brandId}.json`);
    const raw = fs.readFileSync(legacyPath, "utf-8");
    const json = JSON.parse(raw);
    return { ...BrandConfigSchema.parse(json), brandDir: brandsDir };
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  const json = JSON.parse(raw);
  return { ...BrandConfigSchema.parse(json), brandDir };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/config/system-prompt.test.ts
```

Expected: All tests PASS (existing tests still work because old fields unchanged, new tests pass with directory structure).

- [ ] **Step 5: Create the carephoto brand directory**

```bash
mkdir -p brands/carephoto/assets
cp /Users/mertokar/Documents/GitHub/lula/public/logo-no-background.png brands/carephoto/assets/logo.png
```

Then move and update `brands/carephoto.json` → `brands/carephoto/brand.json`, adding the new fields:

```json
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
  "postingSchedule": {
    "frequency": "daily",
    "preferredTime": "10:00"
  },
  "promptBankPath": "/Users/mertokar/Documents/GitHub/lula/public/promptbank/prompts.json",
  "instagramHandle": "careaiphotoeditor",
  "branding": {
    "enabled": true,
    "logoPath": "assets/logo.png",
    "showLogo": true,
    "showHandle": true,
    "showPageIndicator": true,
    "showSwipeArrow": true
  },
  "carousel": {
    "preferCarousel": true,
    "frequency": 0.4,
    "maxSlides": 10,
    "minSlides": 2
  }
}
```

- [ ] **Step 6: Delete old flat config file**

```bash
rm brands/carephoto.json
```

- [ ] **Step 7: Commit**

```bash
git add brands/ src/config/load-brand.ts tests/config/system-prompt.test.ts
git rm brands/carephoto.json
git commit -m "feat: restructure brands as directories with branding and carousel config"
```

---

### Task 3: Build the core image branding function

**Files:**
- Create: `src/tools/brand-image.ts`
- Create: `tests/tools/brand-image.test.ts`

- [ ] **Step 1: Write failing tests for brandImage**

Create `tests/tools/brand-image.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { brandImage } from "../../src/tools/brand-image.js";
import fs from "fs";
import path from "path";
import os from "os";
import sharp from "sharp";

// Create a test brand directory with a small logo
let testBrandDir: string;
let testLogoPath: string;

beforeAll(async () => {
  testBrandDir = fs.mkdtempSync(path.join(os.tmpdir(), "brand-img-test-"));
  fs.mkdirSync(path.join(testBrandDir, "assets"), { recursive: true });

  // Create a 100x100 red PNG as test logo
  const logoBuf = await sharp({
    create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
  })
    .png()
    .toBuffer();
  testLogoPath = path.join(testBrandDir, "assets", "logo.png");
  fs.writeFileSync(testLogoPath, logoBuf);
});

afterAll(() => {
  fs.rmSync(testBrandDir, { recursive: true });
});

const baseBranding = {
  enabled: true,
  logoPath: "assets/logo.png",
  showLogo: true,
  showHandle: true,
  showPageIndicator: true,
  showSwipeArrow: true,
};

describe("brandImage", () => {
  it("creates a 1080x1350 image from a text card", async () => {
    const result = await brandImage({
      imageSource: null,
      textOverlay: "Hello World",
      textPosition: "center",
      isThumbnail: false,
      pageNumber: null,
      totalPages: null,
      backgroundColor: "#1a1a2e",
      branding: baseBranding,
      brandDir: testBrandDir,
      instagramHandle: "testbrand",
    });

    expect(fs.existsSync(result)).toBe(true);
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1350);

    fs.unlinkSync(result);
  });

  it("adds page indicator when pageNumber is set", async () => {
    const result = await brandImage({
      imageSource: null,
      textOverlay: "Slide 2",
      textPosition: "center",
      isThumbnail: false,
      pageNumber: 2,
      totalPages: 5,
      backgroundColor: "#2a2a3e",
      branding: baseBranding,
      brandDir: testBrandDir,
      instagramHandle: "testbrand",
    });

    expect(fs.existsSync(result)).toBe(true);
    // We can't easily verify overlay content, but we verify it doesn't crash
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(1080);

    fs.unlinkSync(result);
  });

  it("skips logo when showLogo is false", async () => {
    const result = await brandImage({
      imageSource: null,
      textOverlay: "No logo",
      textPosition: "center",
      isThumbnail: false,
      pageNumber: null,
      totalPages: null,
      backgroundColor: "#333",
      branding: { ...baseBranding, showLogo: false },
      brandDir: testBrandDir,
      instagramHandle: "testbrand",
    });

    expect(fs.existsSync(result)).toBe(true);
    fs.unlinkSync(result);
  });

  it("brands an image from a local file path", async () => {
    // Create a test source image
    const srcPath = path.join(testBrandDir, "source.png");
    await sharp({
      create: { width: 800, height: 1000, channels: 3, background: { r: 100, g: 100, b: 200 } },
    })
      .png()
      .toFile(srcPath);

    const result = await brandImage({
      imageSource: srcPath,
      textOverlay: "Branded!",
      textPosition: "top",
      isThumbnail: true,
      pageNumber: 1,
      totalPages: 3,
      backgroundColor: null,
      branding: baseBranding,
      brandDir: testBrandDir,
      instagramHandle: "testbrand",
    });

    expect(fs.existsSync(result)).toBe(true);
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1350);

    fs.unlinkSync(result);
    fs.unlinkSync(srcPath);
  });

  it("creates image without any text overlay", async () => {
    const result = await brandImage({
      imageSource: null,
      textOverlay: null,
      textPosition: "center",
      isThumbnail: false,
      pageNumber: 1,
      totalPages: 1,
      backgroundColor: "#000",
      branding: baseBranding,
      brandDir: testBrandDir,
      instagramHandle: "testbrand",
    });

    expect(fs.existsSync(result)).toBe(true);
    fs.unlinkSync(result);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/tools/brand-image.test.ts
```

Expected: FAIL — `brand-image.ts` doesn't exist.

- [ ] **Step 3: Implement brandImage function**

Create `src/tools/brand-image.ts`:

```typescript
import sharp, { OverlayOptions } from "sharp";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1350;
const PADDING = 40;
const LOGO_SIZE = 72;

interface BrandingConfig {
  enabled: boolean;
  logoPath: string;
  showLogo: boolean;
  showHandle: boolean;
  showPageIndicator: boolean;
  showSwipeArrow: boolean;
}

interface BrandImageInput {
  imageSource: string | null; // local path or URL; null → text card
  textOverlay: string | null;
  textPosition: "top" | "center" | "bottom";
  isThumbnail: boolean;
  pageNumber: number | null;
  totalPages: number | null;
  backgroundColor: string | null;
  branding: BrandingConfig;
  brandDir: string;
  instagramHandle: string;
}

const TMP_DIR = path.resolve("tmp/branded");

function ensureTmpDir(): void {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

async function fetchImage(source: string): Promise<Buffer> {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  return fs.readFileSync(source);
}

function buildTextOverlaySvg(
  text: string,
  position: "top" | "center" | "bottom",
  isThumbnail: boolean
): Buffer {
  const fontSize = isThumbnail ? 64 : 42;
  const fontWeight = isThumbnail ? 800 : 600;
  const lineHeight = fontSize * 1.3;

  const lines = text.split("\n");
  const totalTextHeight = lines.length * lineHeight;

  let yStart: number;
  if (position === "top") {
    yStart = PADDING + LOGO_SIZE + 40;
  } else if (position === "bottom") {
    yStart = CANVAS_HEIGHT - totalTextHeight - 120;
  } else {
    yStart = (CANVAS_HEIGHT - totalTextHeight) / 2;
  }

  const textLines = lines
    .map(
      (line, i) =>
        `<text x="${PADDING + 10}" y="${yStart + i * lineHeight}" 
          font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" 
          font-weight="${fontWeight}" fill="white"
          filter="url(#shadow)">${escapeXml(line)}</text>`
    )
    .join("\n");

  const svg = `<svg width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="3" stdDeviation="${isThumbnail ? 8 : 5}" flood-color="rgba(0,0,0,0.7)"/>
      </filter>
    </defs>
    ${textLines}
  </svg>`;

  return Buffer.from(svg);
}

function buildPageIndicatorSvg(page: number, total: number): Buffer {
  const text = `${page}/${total}`;
  const svg = `<svg width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${CANVAS_WIDTH - PADDING - 80}" y="${PADDING}" width="80" height="36" rx="18" fill="rgba(0,0,0,0.6)"/>
    <text x="${CANVAS_WIDTH - PADDING - 40}" y="${PADDING + 24}" 
      font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="600" 
      fill="white" text-anchor="middle">${text}</text>
  </svg>`;
  return Buffer.from(svg);
}

function buildSwipeArrowSvg(): Buffer {
  const cx = CANVAS_WIDTH - 28;
  const cy = CANVAS_HEIGHT / 2;
  const svg = `<svg width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${cx}" cy="${cy}" r="20" fill="rgba(255,255,255,0.2)"/>
    <text x="${cx}" y="${cy + 6}" font-family="Arial" font-size="20" fill="white" text-anchor="middle">›</text>
  </svg>`;
  return Buffer.from(svg);
}

function buildHandleBarSvg(handle: string): Buffer {
  const barHeight = 52;
  const barY = CANVAS_HEIGHT - barHeight;
  const svg = `<svg width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="${barY}" width="${CANVAS_WIDTH}" height="${barHeight}" fill="rgba(0,0,0,0.5)"/>
    <rect x="${PADDING}" y="${barY + 14}" width="24" height="24" rx="6" fill="none" stroke="white" stroke-width="2"/>
    <text x="${PADDING + 12}" y="${barY + 32}" font-family="Arial" font-size="11" font-weight="bold" fill="white" text-anchor="middle">IG</text>
    <text x="${PADDING + 36}" y="${barY + 33}" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="500" fill="white">@${escapeXml(handle)}</text>
  </svg>`;
  return Buffer.from(svg);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function brandImage(input: BrandImageInput): Promise<string> {
  ensureTmpDir();

  const { branding } = input;

  // 1. Create or load base image
  let base: sharp.Sharp;
  if (input.imageSource) {
    const buf = await fetchImage(input.imageSource);
    base = sharp(buf).resize(CANVAS_WIDTH, CANVAS_HEIGHT, {
      fit: "cover",
      position: "centre",
    });
  } else {
    const bg = input.backgroundColor
      ? hexToRgb(input.backgroundColor)
      : { r: 26, g: 26, b: 46 };
    base = sharp({
      create: {
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        channels: 3,
        background: bg,
      },
    });
  }

  // Convert to png for compositing
  const baseBuffer = await base.png().toBuffer();
  const composites: OverlayOptions[] = [];

  // 2. Text overlay
  if (input.textOverlay) {
    composites.push({
      input: buildTextOverlaySvg(
        input.textOverlay,
        input.textPosition,
        input.isThumbnail
      ),
      top: 0,
      left: 0,
    });
  }

  // 3. Logo
  if (branding.showLogo) {
    const logoAbsPath = path.resolve(input.brandDir, branding.logoPath);
    if (fs.existsSync(logoAbsPath)) {
      const logoBuf = await sharp(logoAbsPath)
        .resize(LOGO_SIZE, LOGO_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      composites.push({ input: logoBuf, top: PADDING, left: PADDING });
    }
  }

  // 4. Page indicator
  if (branding.showPageIndicator && input.pageNumber !== null && input.totalPages !== null) {
    composites.push({
      input: buildPageIndicatorSvg(input.pageNumber, input.totalPages),
      top: 0,
      left: 0,
    });
  }

  // 5. Swipe arrow (only for carousel slides, not the last one)
  if (
    branding.showSwipeArrow &&
    input.pageNumber !== null &&
    input.totalPages !== null &&
    input.pageNumber < input.totalPages
  ) {
    composites.push({
      input: buildSwipeArrowSvg(),
      top: 0,
      left: 0,
    });
  }

  // 6. Handle bar
  if (branding.showHandle && input.instagramHandle) {
    composites.push({
      input: buildHandleBarSvg(input.instagramHandle),
      top: 0,
      left: 0,
    });
  }

  // 7. Composite and save
  const outputPath = path.join(TMP_DIR, `${randomUUID()}.png`);
  await sharp(baseBuffer).composite(composites).png().toFile(outputPath);

  return outputPath;
}

export async function brandCarousel(
  slides: Array<{
    imageSource: string | null;
    textOverlay: string | null;
    textPosition: "top" | "center" | "bottom";
    isThumbnail: boolean;
    backgroundColor: string | null;
  }>,
  branding: BrandingConfig,
  brandDir: string,
  instagramHandle: string
): Promise<string[]> {
  const totalPages = slides.length;
  const paths: string[] = [];

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const outputPath = await brandImage({
      imageSource: slide.imageSource,
      textOverlay: slide.textOverlay,
      textPosition: slide.textPosition,
      isThumbnail: slide.isThumbnail,
      pageNumber: totalPages > 1 ? i + 1 : null,
      totalPages: totalPages > 1 ? totalPages : null,
      backgroundColor: slide.backgroundColor,
      branding,
      brandDir,
      instagramHandle,
    });
    paths.push(outputPath);
  }

  return paths;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/tools/brand-image.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Add tests for brandCarousel**

Append to `tests/tools/brand-image.test.ts`:

```typescript
import { brandCarousel } from "../../src/tools/brand-image.js";

describe("brandCarousel", () => {
  it("brands multiple slides with auto page numbering", async () => {
    const paths = await brandCarousel(
      [
        { imageSource: null, textOverlay: "Slide 1", textPosition: "center", isThumbnail: true, backgroundColor: "#111" },
        { imageSource: null, textOverlay: "Slide 2", textPosition: "center", isThumbnail: false, backgroundColor: "#222" },
        { imageSource: null, textOverlay: "Slide 3", textPosition: "center", isThumbnail: false, backgroundColor: "#333" },
      ],
      baseBranding,
      testBrandDir,
      "testbrand"
    );

    expect(paths).toHaveLength(3);
    for (const p of paths) {
      expect(fs.existsSync(p)).toBe(true);
      const meta = await sharp(p).metadata();
      expect(meta.width).toBe(1080);
      expect(meta.height).toBe(1350);
      fs.unlinkSync(p);
    }
  });

  it("single slide carousel has no page indicator", async () => {
    const paths = await brandCarousel(
      [{ imageSource: null, textOverlay: "Solo", textPosition: "center", isThumbnail: false, backgroundColor: "#000" }],
      baseBranding,
      testBrandDir,
      "testbrand"
    );

    expect(paths).toHaveLength(1);
    expect(fs.existsSync(paths[0])).toBe(true);
    fs.unlinkSync(paths[0]);
  });
});
```

- [ ] **Step 6: Run all brand-image tests**

```bash
npx vitest run tests/tools/brand-image.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/tools/brand-image.ts tests/tools/brand-image.test.ts
git commit -m "feat: add image branding and carousel compositing with sharp"
```

---

### Task 4: Update schedule_post to support multiple images

**Files:**
- Modify: `src/tools/schedule-post.ts`
- Modify: `tests/tools/schedule-post.test.ts`

- [ ] **Step 1: Write failing tests for images[] interface**

Update `tests/tools/schedule-post.test.ts` — change all `imageUrl` references to `images` arrays and add a carousel test:

Replace the existing test calls. Change the `SchedulePostInput` interface usage:

```typescript
// In the "sends a post to Postiz" test, change input:
const result = await schedulePost({
  caption: "Check out our AI edits!",
  hashtags: ["#ai", "#photo"],
  images: ["https://example.com/img.jpg"],
  scheduledTime: "2026-04-12T10:00:00Z",
});

// In "posts immediately when no scheduledTime":
const result = await schedulePost({
  caption: "Test",
  hashtags: [],
  images: ["https://example.com/img.jpg"],
});

// In "returns error message on post failure":
const result = await schedulePost({
  caption: "Test",
  hashtags: [],
  images: ["https://example.com/img.jpg"],
});

// In "returns error when no Instagram integration found":
const result = await schedulePost({
  caption: "Test",
  hashtags: [],
  images: ["https://example.com/img.jpg"],
});

// In "returns message when API key not configured":
const result = await schedulePost({
  caption: "Test",
  hashtags: [],
  images: ["https://example.com/img.jpg"],
});
```

Add a new test for carousel posting:

```typescript
it("uploads multiple images for carousel post", async () => {
  // 1. GET /integrations
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve([
        { id: "int-1", identifier: "instagram", name: "Test IG" },
      ]),
  });
  // 2. POST /upload-from-url (image 1)
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve({ id: "media-1", path: "https://cdn.test/img1.webp" }),
  });
  // 3. POST /upload-from-url (image 2)
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve({ id: "media-2", path: "https://cdn.test/img2.webp" }),
  });
  // 4. POST /posts
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ id: "carousel-123" }),
  });

  const result = await schedulePost({
    caption: "Carousel post!",
    hashtags: ["#carousel"],
    images: [
      "https://example.com/img1.jpg",
      "https://example.com/img2.jpg",
    ],
  });

  expect(result).toContain("carousel-123");
  expect(mockFetch).toHaveBeenCalledTimes(4); // integrations + 2 uploads + post

  // Verify the post body has multiple images
  const postCall = mockFetch.mock.calls[3];
  const body = JSON.parse(postCall[1].body);
  expect(body.posts[0].value[0].image).toHaveLength(2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/tools/schedule-post.test.ts
```

Expected: FAIL — `schedulePost` doesn't accept `images` property.

- [ ] **Step 3: Update schedule-post.ts**

Replace `src/tools/schedule-post.ts`:

```typescript
interface SchedulePostInput {
  caption: string;
  hashtags: string[];
  images: string[];
  scheduledTime?: string;
}

interface PostizMedia {
  id: string;
  path: string;
}

interface PostizIntegration {
  id: string;
  identifier: string;
  name: string;
}

async function postizFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const apiKey = process.env.POSTIZ_API_KEY!;
  const baseUrl =
    process.env.POSTIZ_BASE_URL ?? "https://app.postiz.com/api/public/v1";

  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
      ...options.headers,
    },
  });
}

async function getInstagramIntegrationId(): Promise<string> {
  const res = await postizFetch("/integrations");
  if (!res.ok) {
    throw new Error(`Failed to list integrations (${res.status}): ${await res.text()}`);
  }

  const integrations = (await res.json()) as PostizIntegration[];
  const instagram = integrations.find((i) => i.identifier === "instagram");
  if (!instagram) {
    throw new Error(
      "No Instagram integration found in Postiz. Connect Instagram first."
    );
  }
  return instagram.id;
}

async function uploadImageFromUrl(url: string): Promise<PostizMedia> {
  const res = await postizFetch("/upload-from-url", {
    method: "POST",
    body: JSON.stringify({ url }),
  });

  if (!res.ok) {
    throw new Error(`Failed to upload image (${res.status}): ${await res.text()}`);
  }

  return (await res.json()) as PostizMedia;
}

export async function schedulePost(input: SchedulePostInput): Promise<string> {
  const apiKey = process.env.POSTIZ_API_KEY;

  if (!apiKey) {
    return "Postiz API key not configured. Post saved to content calendar but not scheduled.";
  }

  try {
    const integrationId = await getInstagramIntegrationId();

    // Upload all images
    const mediaItems: Array<{ id: string; path: string }> = [];
    for (const imageUrl of input.images) {
      const media = await uploadImageFromUrl(imageUrl);
      mediaItems.push({ id: media.id, path: imageUrl });
    }

    const fullCaption =
      input.caption +
      (input.hashtags.length > 0 ? "\n\n" + input.hashtags.join(" ") : "");

    const postDate = input.scheduledTime ?? new Date().toISOString();
    const body = {
      type: input.scheduledTime ? "schedule" : "now",
      date: postDate,
      shortLink: false,
      tags: [],
      posts: [
        {
          integration: { id: integrationId },
          value: [
            {
              content: fullCaption,
              image: mediaItems,
            },
          ],
          settings: { post_type: mediaItems.length > 1 ? "carousel" : ("post" as const) },
        },
      ],
    };

    const res = await postizFetch("/posts", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return `Failed to schedule post via Postiz (${res.status}): ${errorText}`;
    }

    const data = (await res.json()) as { id?: string };
    const postType = mediaItems.length > 1 ? "Carousel" : "Post";
    return `${postType} scheduled successfully via Postiz. ID: ${data.id ?? "unknown"}, Type: ${body.type}, Images: ${mediaItems.length}`;
  } catch (error) {
    return `Failed to schedule post: ${error instanceof Error ? error.message : String(error)}`;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/tools/schedule-post.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/schedule-post.ts tests/tools/schedule-post.test.ts
git commit -m "feat: update schedule-post to support carousel with images array"
```

---

### Task 5: Register branding tools in the orchestrator

**Files:**
- Modify: `src/orchestrator.ts`
- Modify: `tests/orchestrator.test.ts`
- Modify: `tests/e2e/dry-run.test.ts`

- [ ] **Step 1: Write failing test for conditional branding tool registration**

Update `tests/orchestrator.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildTools } from "../src/orchestrator.js";
import { createDatabase } from "../src/db/schema.js";
import type { BrandConfig } from "../src/config/load-brand.js";

const mockBrand: BrandConfig = {
  id: "testbrand",
  name: "Test Brand",
  domain: "test.com",
  niche: "testing",
  description: "A test brand",
  competitors: [{ name: "Competitor A", website: "https://a.com" }],
  keywords: ["test"],
  tone: "Professional",
  postingSchedule: { frequency: "daily", preferredTime: "10:00" },
  brandDir: "/tmp/testbrand",
};

describe("buildTools", () => {
  it("returns 6 tools without promptBankPath or branding", () => {
    const db = createDatabase(":memory:");
    const tools = buildTools(mockBrand, db);
    expect(tools).toHaveLength(6);
    expect(tools.map((t) => t.name)).not.toContain("browse_prompt_bank");
    expect(tools.map((t) => t.name)).not.toContain("brand_image");
    expect(tools.map((t) => t.name)).not.toContain("brand_carousel");
    db.close();
  });

  it("returns 7 tools with promptBankPath", () => {
    const db = createDatabase(":memory:");
    const brandWithBank = { ...mockBrand, promptBankPath: "/tmp/prompts.json" };
    const tools = buildTools(brandWithBank, db);
    expect(tools).toHaveLength(7);
    expect(tools.map((t) => t.name)).toContain("browse_prompt_bank");
    db.close();
  });

  it("returns 8 tools with branding enabled", () => {
    const db = createDatabase(":memory:");
    const brandWithBranding: BrandConfig = {
      ...mockBrand,
      instagramHandle: "testbrand",
      branding: {
        enabled: true,
        logoPath: "assets/logo.png",
        showLogo: true,
        showHandle: true,
        showPageIndicator: true,
        showSwipeArrow: true,
      },
    };
    const tools = buildTools(brandWithBranding, db);
    expect(tools.map((t) => t.name)).toContain("brand_image");
    expect(tools.map((t) => t.name)).toContain("brand_carousel");
    expect(tools).toHaveLength(8);
    db.close();
  });

  it("does not register branding tools when branding disabled", () => {
    const db = createDatabase(":memory:");
    const brandDisabled: BrandConfig = {
      ...mockBrand,
      branding: {
        enabled: false,
        logoPath: "assets/logo.png",
        showLogo: true,
        showHandle: true,
        showPageIndicator: true,
        showSwipeArrow: true,
      },
    };
    const tools = buildTools(brandDisabled, db);
    expect(tools.map((t) => t.name)).not.toContain("brand_image");
    expect(tools.map((t) => t.name)).not.toContain("brand_carousel");
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/orchestrator.test.ts
```

Expected: FAIL — `brand_image` and `brand_carousel` tools not registered, counts wrong.

- [ ] **Step 3: Update orchestrator to register branding tools and use images[]**

In `src/orchestrator.ts`, add imports at top:

```typescript
import { brandImage, brandCarousel } from "./tools/brand-image.js";
```

Update the `schedule_post` tool's `inputSchema` — change `imageUrl` to `images`:

```typescript
inputSchema: z.object({
  caption: z.string().describe("Post caption"),
  hashtags: z.array(z.string()).describe("Hashtags for the post"),
  images: z.array(z.string()).describe("Array of image URLs or local paths. Single item = regular post, multiple = carousel."),
  scheduledTime: z
    .string()
    .optional()
    .describe("ISO timestamp for when to post (optional, posts immediately if omitted)"),
}),
```

Update the `schedule_post` run handler — change `input.imageUrl` to `input.images`:

```typescript
run: async (input) => {
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
    insertPost(db, {
      brand_id: brand.id,
      caption: input.caption,
      hashtags: input.hashtags,
      image_url: input.images[0],
      content_theme: "scheduled",
      posted_at: input.scheduledTime ?? new Date().toISOString(),
    });
    updateContentCalendarStatus(db, calendarId, "posted");
  } else {
    updateContentCalendarStatus(db, calendarId, "planned");
  }

  return result;
},
```

Add the branding tools conditionally (same pattern as promptBank), before the `send_notification` tool:

```typescript
...(brand.branding?.enabled
  ? [
      betaZodTool({
        name: "brand_image",
        description:
          "Apply brand overlays (logo, handle, page indicator) to a single image. Use for single-image posts. Returns the local path of the branded image.",
        inputSchema: z.object({
          imageUrl: z
            .string()
            .nullable()
            .describe("URL or local path to the source image. null for text-card mode."),
          textOverlay: z
            .string()
            .nullable()
            .describe("Text to overlay on the image. null for no text."),
          textPosition: z
            .enum(["top", "center", "bottom"])
            .default("center")
            .describe("Position of text overlay"),
          isThumbnail: z
            .boolean()
            .default(false)
            .describe("Use larger/bolder text for thumbnail slides"),
          pageNumber: z
            .number()
            .nullable()
            .default(null)
            .describe("Page number for indicator (null = no indicator)"),
          totalPages: z
            .number()
            .nullable()
            .default(null)
            .describe("Total pages for indicator"),
          backgroundColor: z
            .string()
            .nullable()
            .default(null)
            .describe("Background color hex for text cards (e.g. '#1a1a2e')"),
        }),
        run: async (input) => {
          const outputPath = await brandImage({
            imageSource: input.imageUrl,
            textOverlay: input.textOverlay,
            textPosition: input.textPosition,
            isThumbnail: input.isThumbnail,
            pageNumber: input.pageNumber,
            totalPages: input.totalPages,
            backgroundColor: input.backgroundColor,
            branding: brand.branding!,
            brandDir: brand.brandDir,
            instagramHandle: brand.instagramHandle ?? "",
          });
          return `Branded image saved to: ${outputPath}`;
        },
      }),
      betaZodTool({
        name: "brand_carousel",
        description:
          "Apply brand overlays to multiple slides for a carousel post. Auto-numbers pages and adds swipe arrows. Returns local paths of all branded images.",
        inputSchema: z.object({
          slides: z.array(
            z.object({
              imageUrl: z
                .string()
                .nullable()
                .describe("URL or local path. null for text-card."),
              textOverlay: z
                .string()
                .nullable()
                .describe("Text overlay. null for no text."),
              textPosition: z
                .enum(["top", "center", "bottom"])
                .default("center")
                .describe("Text position"),
              isThumbnail: z
                .boolean()
                .default(false)
                .describe("Thumbnail mode (bold text)"),
              backgroundColor: z
                .string()
                .nullable()
                .default(null)
                .describe("Background color for text cards"),
            })
          ).describe("Array of slide definitions"),
        }),
        run: async (input) => {
          const paths = await brandCarousel(
            input.slides.map((s) => ({
              imageSource: s.imageUrl,
              textOverlay: s.textOverlay,
              textPosition: s.textPosition,
              isThumbnail: s.isThumbnail,
              backgroundColor: s.backgroundColor,
            })),
            brand.branding!,
            brand.brandDir,
            brand.instagramHandle ?? ""
          );
          return `Branded ${paths.length} slides:\n${paths.map((p, i) => `  Slide ${i + 1}: ${p}`).join("\n")}`;
        },
      }),
    ]
  : []),
```

- [ ] **Step 4: Run orchestrator tests**

```bash
npx vitest run tests/orchestrator.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Update e2e dry-run test with brandDir**

In `tests/e2e/dry-run.test.ts`, add `brandDir: "/tmp"` to the `mockBrand`:

```typescript
const mockBrand: BrandConfig = {
  id: "testbrand",
  name: "Test Brand",
  domain: "test.com",
  niche: "testing",
  description: "A test brand for dry runs",
  competitors: [{ name: "Competitor A", website: "https://a.com" }],
  keywords: ["test"],
  tone: "Professional",
  postingSchedule: { frequency: "daily", preferredTime: "10:00" },
  brandDir: "/tmp",
};
```

- [ ] **Step 6: Run all tests**

```bash
npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/orchestrator.ts tests/orchestrator.test.ts tests/e2e/dry-run.test.ts
git commit -m "feat: register brand_image and brand_carousel tools conditionally"
```

---

### Task 6: Update system prompt with carousel and thumbnail strategy

**Files:**
- Modify: `src/config/system-prompt.ts`
- Modify: `tests/config/system-prompt.test.ts`

- [ ] **Step 1: Write failing tests for new prompt sections**

Add to `tests/config/system-prompt.test.ts`:

```typescript
it("includes carousel strategy when carousel config present", () => {
  const brandWithCarousel: BrandConfig = {
    ...mockBrand,
    brandDir: "/tmp",
    carousel: {
      preferCarousel: true,
      frequency: 0.4,
      maxSlides: 10,
      minSlides: 2,
    },
  };
  const prompt = buildSystemPrompt(brandWithCarousel);
  expect(prompt).toContain("Carousel vs Single Image");
  expect(prompt).toContain("40%");
});

it("includes thumbnail strategy when branding enabled", () => {
  const brandWithBranding: BrandConfig = {
    ...mockBrand,
    brandDir: "/tmp",
    instagramHandle: "testbrand",
    branding: {
      enabled: true,
      logoPath: "assets/logo.png",
      showLogo: true,
      showHandle: true,
      showPageIndicator: true,
      showSwipeArrow: true,
    },
  };
  const prompt = buildSystemPrompt(brandWithBranding);
  expect(prompt).toContain("Thumbnail");
  expect(prompt).toContain("brand_image");
});

it("does not include branding instructions when branding disabled", () => {
  const prompt = buildSystemPrompt({ ...mockBrand, brandDir: "/tmp" });
  expect(prompt).not.toContain("brand_image");
  expect(prompt).not.toContain("brand_carousel");
});
```

Update existing `mockBrand` in that file to include `brandDir: "/tmp"`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/config/system-prompt.test.ts
```

Expected: FAIL — prompt doesn't contain carousel/branding sections.

- [ ] **Step 3: Update system-prompt.ts**

Replace `src/config/system-prompt.ts`:

```typescript
import type { BrandConfig } from "./load-brand.js";

export function buildSystemPrompt(brand: BrandConfig): string {
  const today = new Date();
  const dateStr = today.toISOString().split("T")[0];
  const dayOfWeek = today.toLocaleDateString("en-US", { weekday: "long" });

  const competitorList = brand.competitors
    .map((c) => `- ${c.name}`)
    .join("\n");

  let prompt = `You are an autonomous marketing agent for ${brand.name} (${brand.domain}).

About the brand: ${brand.description}
Brand voice: ${brand.tone}
Niche: ${brand.niche}

Your job is to run the daily marketing cycle:
1. Research competitors and trends using your tools
2. Review recent post performance
3. Decide on today's content strategy
4. ${brand.branding?.enabled ? "Plan content format (single vs carousel), select images from prompt bank, brand them with overlays, and schedule via schedule_post. Or skip with reasoning." : "Generate and schedule a post (or decide to skip with reasoning)"}
5. Send a summary notification

Today is ${dateStr}, ${dayOfWeek}.

Recent post history and performance data will be provided when you query for it.
Competitors to monitor:
${competitorList}

Content strategy:
- BEFORE choosing content, ALWAYS call get_recent_posts to see what was already posted
- NEVER reuse the exact same image — always pick a different one
- NEVER copy a previous caption verbatim — always write fresh copy
- BUT: if a content theme or style performed well, DO repeat it — double down on what works
- Rotate across content pillars so you don't post the same type back-to-back:
  * Educational (tips, how-tos, before/after demos)
  * Social proof (user showcases, testimonials, results)
  * Trending (industry news, trending topics, timely hooks)
  * Behind-the-scenes (product updates, process, team)
  * Engagement bait (questions, polls, hot takes)
- Check post performance data — if a pillar consistently outperforms, weight it more heavily (up to 40% of posts)
- Use strong hooks in the first line — curiosity, story, or value hooks perform best
- Keep captions authentic to the brand voice

Posting guidelines:
- Post daily unless there's a good reason not to
- Use 20-30 relevant hashtags per post
- Always explain your reasoning in the content calendar
- When scheduling a post, always record the entry in the content calendar first`;

  // Carousel strategy
  if (brand.carousel) {
    const pct = Math.round(brand.carousel.frequency * 100);
    prompt += `

Carousel vs Single Image:
- Target ~${pct}% carousel posts overall
- Use carousel (${brand.carousel.minSlides}-${brand.carousel.maxSlides} slides) when the topic has:
  * Multiple features or angles to showcase
  * Step-by-step tutorials or how-tos
  * Before/after comparisons (multiple examples)
  * Listicle content ("5 tips for...")
  * Product walkthroughs
- Use single image when:
  * The message is simple and punchy
  * It's a quote, meme, or single visual moment
  * Engagement bait (questions, polls)
- Mix slide types: photo slides + text cards for variety
- ALWAYS check get_recent_posts to avoid posting the same format back-to-back`;
  }

  // Branding + thumbnail instructions
  if (brand.branding?.enabled) {
    prompt += `

Image Branding:
- ALWAYS brand images before posting — use brand_image for single posts, brand_carousel for multi-slide
- brand_carousel handles page numbering and swipe arrows automatically
- For single posts, use brand_image with pageNumber: null
- Text overlays should be short, punchy, and readable at mobile sizes
- For text-card slides (no source image), set imageUrl to null and choose a backgroundColor
- Text position guide:
  * "top" — when the image subject is in the lower half
  * "center" — for text cards or centered compositions
  * "bottom" — when the image subject is in the upper half

Thumbnail (Slide 1) Strategy:
- Slide 1 is the ONLY thing users see in the feed — it must stop the scroll
- Always set isThumbnail: true on slide 1
- Use bold, short text (under 10 words)
- Hook types that work:
  * Curiosity: "You're editing photos wrong"
  * Value: "3 AI tricks pros won't tell you"
  * Story: "She had 0 matches. Then she tried AI."
  * Contrast: "Amateur vs AI-edited"
- Pair the hook text with your strongest image
- The thumbnail text should tell what the carousel is about — don't be vague`;
  }

  return prompt;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/config/system-prompt.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config/system-prompt.ts tests/config/system-prompt.test.ts
git commit -m "feat: add carousel decision logic and thumbnail strategy to system prompt"
```

---

### Task 7: Final integration — run all tests and verify

**Files:** None (verification only)

- [ ] **Step 1: Run the full test suite**

```bash
npx vitest run
```

Expected: All tests pass across all test files.

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 3: Quick manual smoke test**

```bash
npx tsx -e "
import { brandImage } from './src/tools/brand-image.js';
const p = await brandImage({
  imageSource: null,
  textOverlay: 'No lens.\nNo lights.\nNo team.\nJust CareAI.',
  textPosition: 'center',
  isThumbnail: true,
  pageNumber: 1,
  totalPages: 5,
  backgroundColor: '#1a1a2e',
  branding: {
    enabled: true,
    logoPath: 'assets/logo.png',
    showLogo: true,
    showHandle: true,
    showPageIndicator: true,
    showSwipeArrow: true,
  },
  brandDir: 'brands/carephoto',
  instagramHandle: 'careaiphotoeditor',
});
console.log('Output:', p);
"
```

Expected: Prints a path to `tmp/branded/<uuid>.png`. Open the file to visually verify the branding looks correct.

- [ ] **Step 4: Commit any remaining fixes if needed**
