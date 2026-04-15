# Image Branding & Carousel System — Design Spec

**Date:** 2026-04-15
**Status:** Approved

## Overview

Add configurable image branding overlays and multi-slide carousel support to the marketing agent. The branding system composites logos, page indicators, Instagram handles, and swipe arrows onto images before posting. Carousel support lets the agent create multi-slide posts when the topic warrants it. All branding is optional and per-brand configurable.

## Brand Directory Structure

Brands become self-contained directories instead of standalone JSON files:

```
brands/
  carephoto/
    brand.json
    assets/
      logo.png
```

`brand.json` is the existing config (renamed from `carephoto.json`), with new sections added. The `assets/` directory holds brand-specific files like the logo. All asset paths in the config are relative to the brand directory.

## Brand Config — New Fields

### `instagramHandle` (top-level)

```json
"instagramHandle": "careaiphotoeditor"
```

Top-level because it's used beyond branding (captions, system prompt, etc.).

### `branding` section

```json
"branding": {
  "enabled": true,
  "logoPath": "assets/logo.png",
  "showLogo": true,
  "showHandle": true,
  "showPageIndicator": true,
  "showSwipeArrow": true
}
```

- `enabled: false` → no overlays, images posted as-is, branding tools not registered
- Per-element toggles only apply when `enabled: true`
- `logoPath` is relative to the brand directory

### `carousel` section

```json
"carousel": {
  "preferCarousel": true,
  "frequency": 0.4,
  "maxSlides": 10,
  "minSlides": 2
}
```

- `frequency` = target ratio of carousel posts (~40%). Agent can override based on topic fit.
- `preferCarousel: false` = agent defaults to single posts but can still choose carousel when it makes sense

## Image Branding System

### Tech: sharp

Use the `sharp` Node.js library for image compositing. It handles PNG/JPEG processing, SVG rendering for text, and multi-layer compositing.

### Canvas: 1080×1350 (Instagram portrait optimal)

### Overlay Layout

| Element | Position | Rendering |
|---|---|---|
| Brand logo | Top-left, 24px padding | Composite PNG from `logoPath` |
| Page indicator | Top-right, pill shape | SVG text "1/5" on semi-transparent pill |
| Text overlay | Agent-controlled (top/center/bottom) | SVG text with drop shadow |
| Swipe arrow | Right center | SVG circle + chevron, carousel only |
| Handle bar | Bottom, full width | Semi-transparent bar + IG icon + handle text |

### Thumbnail Mode

When `isThumbnail: true`:
- Text overlay uses larger font size and bolder weight
- More aggressive text shadow for readability
- Intended for slide 1 — the scroll-stopper

### Text Card Mode

When `imageUrl` is null:
- Creates a solid color canvas using `backgroundColor`
- Text centered on the card
- All branding overlays still applied
- Used for info slides, tips, stats, CTAs

## Tool Interfaces

### `brand_image` — Single Image Branding

```typescript
Input: {
  imageUrl: string | null       // null → text card mode
  textOverlay: string | null    // text to render on the image
  textPosition: "top" | "center" | "bottom"  // default: "center"
  isThumbnail: boolean          // larger/bolder text treatment
  pageNumber: number | null     // null → no page indicator
  totalPages: number | null
  backgroundColor: string | null // for text cards
}

Output: string  // local path to branded image
```

Core branding function. Downloads/creates image, resizes to 1080×1350, composites overlays based on brand config toggles, saves to `tmp/branded/`.

### `brand_carousel` — Batch Carousel Branding

```typescript
Input: {
  slides: Array<{
    imageUrl: string | null
    textOverlay: string | null
    textPosition: "top" | "center" | "bottom"
    isThumbnail: boolean
    backgroundColor: string | null
  }>
}

Output: string  // JSON with array of local paths
```

Orchestration layer over `brand_image`. Auto-calculates page numbers from array index (1/N, 2/N, ...). Adds swipe arrow to all slides except the last. Returns all branded image paths.

### `schedule_post` — Updated

```typescript
Input: {
  caption: string
  hashtags: string[]
  images: string[]         // replaces imageUrl: string
  scheduledTime?: string
}
```

- Single item in `images` → regular post
- Multiple items → carousel post via Postiz
- Each image is uploaded separately, all included in the post's image array

## Conditional Tool Registration

Same pattern as the existing prompt bank tool:
- If `branding.enabled = true` → register `brand_image` and `brand_carousel`
- If `branding.enabled = false` → tools not registered, agent posts images directly

## System Prompt Updates

### Carousel Decision Logic

Added to system prompt when `carousel` config is present:

- Target ~{frequency×100}% carousel posts overall
- Use carousel when topic has: multiple features, step-by-step tutorials, before/after comparisons, listicle content, product walkthroughs
- Use single image when: message is simple/punchy, quote or meme, engagement bait
- Mix slide types (photo + text cards) for variety
- Check recent posts to avoid same format back-to-back

### Thumbnail Strategy

- Slide 1 must stop the scroll — always `isThumbnail: true`
- Bold, short text (under 10 words)
- Hook types: curiosity, value, story, contrast
- Pair hook text with the strongest image
- Thumbnail text should clearly convey what the carousel is about

### Branding Instructions

- Always brand images before posting when tools are available
- Use `brand_carousel` for multi-slide, `brand_image` for single posts
- Text overlays should be short and readable at mobile feed size
- Text position depends on image subject placement

### Updated Daily Cycle

Step 4 changes from "Generate and schedule a post" to "Plan content format (single vs carousel), select images from prompt bank, brand them with overlays, and schedule via schedule_post."

## Dependencies

- `sharp` — new dependency for image compositing
- No other new dependencies required

## Out of Scope (Future)

- Generating images via carephoto.art API (future: monetization through image gen)
- A/B testing different thumbnail styles
- Video/reel support
- Story-specific formatting
