import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { betaZodTool as _betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";

// The SDK's betaZodTool runtime imports `zod/v4` (see helpers/beta/zod.mjs)
// but its .d.ts still types the schema as v3's ZodType. Passing v4 schemas
// is required at runtime, so we cast to sidestep the outdated type bound.
const betaZodTool = _betaZodTool as unknown as (options: {
  name: string;
  description: string;
  inputSchema: any;
  run: (args: any, context?: any) => Promise<string> | string;
}) => any;
import path from "path";
import Database from "better-sqlite3";
import type { BrandConfig } from "./config/load-brand.js";
import { loadDesignSystem, type DesignSystem, isHtmlTokens, isReactJsx, type ReactJsxManifest } from "./config/load-design-system.js";
import { buildSystemPrompt } from "./config/system-prompt.js";
import { scrapeCompetitor } from "./tools/scrape-competitor.js";
import { searchTrends } from "./tools/search-trends.js";
import { getRecentPostsTool } from "./tools/recent-posts.js";
import { getPostPerformanceTool } from "./tools/post-performance.js";
import { schedulePost } from "./tools/schedule-post.js";
import { sendNotification } from "./tools/notify.js";
import { browsePromptBank } from "./tools/prompt-bank.js";
import { brandImage, brandCarousel } from "./tools/brand-image.js";
import { renderCarouselCover } from "./tools/carousel-cover.js";
import { renderPhotoOverlay } from "./tools/photo-overlay.js";
import { renderReactSlide, type SlideKind } from "./tools/react-slide.js";
import { ingestAnalytics } from "./tools/ingest-analytics.js";
import {
  insertPost,
  insertCompetitorSnapshot,
  insertContentCalendarEntry,
  updateContentCalendarStatus,
  getUsedPromptIds,
} from "./db/queries.js";

function requireNonEmpty<T extends string>(arr: T[], label: string): [T, ...T[]] {
  if (arr.length === 0) throw new Error(`${label} is empty`);
  return arr as [T, ...T[]];
}

function buildReactJsxTools(
  ds: ReactJsxManifest & { rootDir: string },
  brand: BrandConfig
) {
  const common = {
    mode: z.enum(["light", "dark"]).default("light").describe("Palette mode — swaps the design-system palette between its light and dark halves."),
    markVariant: z.enum(["quad", "ring", "bar"]).default("quad").describe("Brand mark shape used in the header chrome."),
    pageNumber: z.number().describe("Page number (1-indexed) for the indicator / dots."),
    totalPages: z.number().describe("Total pages in the carousel."),
    accentColor: z.string().nullable().default(null).describe("Optional hex accent override for this slide. null falls back to the brand-level default accent (brand.json branding.colors.accent) and then to the design-system palette."),
    handleOverride: z.string().nullable().default(null).describe("Optional @handle override; null uses the brand's default."),
  };

  const currentYear = String(new Date().getFullYear());
  const brandDefaultAccent = brand.branding?.colors?.accent ?? null;

  async function runSlide(
    kind: SlideKind,
    slide: Record<string, unknown>,
    input: {
      mode: "light" | "dark";
      markVariant: "quad" | "ring" | "bar";
      pageNumber: number;
      totalPages: number;
      accentColor: string | null;
      handleOverride: string | null;
    }
  ): Promise<string> {
    // Accent precedence: per-call override → brand default → design-system palette.
    const accent = input.accentColor ?? brandDefaultAccent;
    return renderReactSlide({
      designSystem: ds,
      slideKind: kind,
      slide,
      handle: input.handleOverride ?? `@${brand.instagramHandle ?? brand.id}`,
      year: currentYear,
      mode: input.mode,
      markVariant: input.markVariant,
      pageNumber: input.pageNumber,
      totalPages: input.totalPages,
      customAccent: accent,
    });
  }

  const coverTool = betaZodTool({
    name: "carousel_cover",
    description: `Render slide 1 (the cover) using the '${ds.name}' design system. Cover slots: eyebrow (small uppercase meta, e.g. 'Issue № 04'), kicker (short descriptor, e.g. 'A field guide'), title (the main headline — scales large, can be a sentence), subtitle (one supporting sentence), cta (short swipe-prompt). Returns a local PNG path.`,
    inputSchema: z.object({
      eyebrow: z.string().nullable().describe("Small uppercase meta line above the headline. null to omit."),
      kicker: z.string().nullable().describe("Short tagline rendered next to or under the eyebrow. null to omit."),
      title: z.string().describe("Main headline. The template handles scaling; 4-14 words works."),
      subtitle: z.string().nullable().describe("One-sentence supporting line. null to omit."),
      cta: z.string().nullable().describe("Short swipe prompt like 'Swipe →'. null to omit."),
      ...common,
    }),
    run: async (input) => {
      const out = await runSlide("cover", {
        eyebrow: input.eyebrow ?? "",
        kicker: input.kicker ?? "",
        title: input.title,
        subtitle: input.subtitle ?? "",
        cta: input.cta ?? "",
      }, input);
      return `Cover saved to: ${out}`;
    },
  });

  const bodyTool = betaZodTool({
    name: "body_slide",
    description: `Render slides 2-N using the '${ds.name}' design system. The 'kind' discriminator picks the layout. Kinds: 'intro' (section opener with eyebrow + title + body), 'numbered' (numbered tip / principle with big numeral + title + body), 'stat' (giant number with unit + caption + footnote), 'list' (title + 3-6 indexed items), 'cta' (closing slide with title + body + handle/save pills). Each kind has its own slot shape. Returns a local PNG path.`,
    inputSchema: z.object({
      slide: z.discriminatedUnion("kind", [
        z.object({
          kind: z.literal("intro"),
          eyebrow: z.string().describe("Short uppercase meta label above the title."),
          title: z.string().describe("Section-opening headline, 4-10 words."),
          body: z.string().describe("Supporting paragraph, 20-60 words."),
          meta: z.string().nullable().describe("Tiny byline like '3 min read' or 'Field guide'. null to omit."),
        }),
        z.object({
          kind: z.literal("numbered"),
          number: z.string().describe("Short numeral/string, e.g. '01', '02', or 'I'."),
          label: z.string().describe("Short label, e.g. 'Principle', 'Rule', 'Tip'."),
          title: z.string().describe("Tip title, 4-10 words."),
          body: z.string().describe("Explanation paragraph, 20-60 words."),
        }),
        z.object({
          kind: z.literal("stat"),
          big: z.string().describe("The giant number or short string, e.g. '3X', '89%', '4:12'."),
          unit: z.string().describe("Unit or qualifier line below the big, e.g. 'minutes', 'more matches'."),
          caption: z.string().describe("Sentence explaining the stat, 10-22 words."),
          footnote: z.string().nullable().describe("Tiny methodology footnote. null to omit."),
        }),
        z.object({
          kind: z.literal("list"),
          title: z.string().describe("List title, 3-7 words."),
          items: z.array(z.object({
            n: z.string().describe("Index like '01', '02'."),
            label: z.string().describe("Short label/category, 1-3 words."),
            v: z.string().describe("The value/item, 2-5 words."),
          })).min(3).max(8).describe("3-8 indexed items."),
        }),
        z.object({
          kind: z.literal("cta"),
          title: z.string().describe("CTA headline, 4-10 words."),
          body: z.string().describe("Reason to act, 15-40 words."),
          handleCta: z.string().describe("Follow/handle pill text, e.g. 'Follow for more'."),
          saveCta: z.string().describe("Save pill text, e.g. 'Save for later'."),
        }),
      ]),
      ...common,
    }),
    run: async (input) => {
      const { slide, ...rest } = input;
      const { kind, ...slots } = slide;
      const out = await runSlide(kind as SlideKind, slots as Record<string, unknown>, rest);
      return `Body slide (${kind}) saved to: ${out}`;
    },
  });

  return [coverTool, bodyTool];
}

export function buildTools(brand: BrandConfig, db: Database.Database) {
  const designSystemId = brand.designSystem ?? "editorial-paper";
  const designSystemsDir = path.resolve("design-systems");
  const designSystem: DesignSystem | null = brand.branding?.enabled
    ? loadDesignSystem(designSystemId, designSystemsDir)
    : null;

  return [
    betaZodTool({
      name: "scrape_competitor",
      description:
        "Scrape a competitor's website to analyze their recent content, marketing strategy, and engagement patterns.",
      inputSchema: z.object({
        name: z.string().describe("Competitor name"),
        url: z.string().url().describe("URL to scrape"),
      }),
      run: async (input) => {
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

    betaZodTool({
      name: "search_trends",
      description:
        "Search the web for trending topics, hashtags, and content angles related to given keywords.",
      inputSchema: z.object({
        keywords: z
          .array(z.string())
          .describe("Keywords to search for trends"),
      }),
      run: async (input) => {
        return searchTrends(input.keywords);
      },
    }),

    betaZodTool({
      name: "get_recent_posts",
      description:
        "Get recent posts for the brand to review what content has been published.",
      inputSchema: z.object({
        limit: z
          .number()
          .default(10)
          .describe("Number of recent posts to retrieve"),
      }),
      run: async (input) => {
        return getRecentPostsTool(db, brand.id, input.limit);
      },
    }),

    betaZodTool({
      name: "get_post_performance",
      description:
        "Get performance analytics for recent posts to understand what content performs well.",
      inputSchema: z.object({
        limit: z
          .number()
          .default(10)
          .describe("Number of posts to get performance for"),
      }),
      run: async (input) => {
        return getPostPerformanceTool(db, brand.id, input.limit);
      },
    }),

    betaZodTool({
      name: "schedule_post",
      description:
        "Schedule a post to Instagram via Postiz. Always record the content in the content calendar first. MUST pass promptIds of any prompt-bank images used so they are tracked as used and not shown in future browse_prompt_bank results.",
      inputSchema: z.object({
        caption: z.string().describe("Post caption"),
        hashtags: z.array(z.string()).describe("Hashtags for the post"),
        images: z.array(z.string()).describe("Array of image URLs or local paths. Single item = regular post, multiple = carousel."),
        promptIds: z
          .array(z.string())
          .describe(
            "REQUIRED: prompt bank IDs (e.g. 'rooftop-dusk-portrait') for every slide that uses a prompt-bank image. Empty array if no prompt-bank images used (e.g. pure text-card/gradient posts). Critical for dedup — if you forget, the image can be reused later."
          ),
        scheduledTime: z
          .string()
          .optional()
          .describe(
            "ISO timestamp for when to post (optional, posts immediately if omitted)"
          ),
      }),
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

        if (result.ok) {
          insertPost(db, {
            brand_id: brand.id,
            caption: input.caption,
            hashtags: input.hashtags,
            image_url: input.images[0],
            content_theme: "scheduled",
            posted_at: input.scheduledTime ?? new Date().toISOString(),
            external_post_id: result.postizId,
            source_images: input.promptIds,
          });
          updateContentCalendarStatus(db, calendarId, "posted");
        } else {
          updateContentCalendarStatus(db, calendarId, "planned");
        }

        return result.message;
      },
    }),

    ...(brand.promptBankPath
      ? [
          betaZodTool({
            name: "browse_prompt_bank",
            description:
              "Browse the brand's prompt bank of existing AI-generated images. Use this to find images that match today's content strategy. Filter by category to narrow results.",
            inputSchema: z.object({
              category: z
                .string()
                .optional()
                .describe(
                  "Filter by category: portrait, lifestyle, fashion, beauty, artistic, lingerie, architectural, product, landscape, automotive, cinematic, romantic. Omit to see all."
                ),
            }),
            run: async (input) => {
              const usedIds = getUsedPromptIds(db, brand.id);
              return browsePromptBank(
                brand.promptBankPath!,
                brand.domain,
                input.category,
                usedIds
              );
            },
          }),
        ]
      : []),

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
                .describe("Flat background color hex for text cards (e.g. '#1a1a2e'). Ignored when 'background' is set to a gradient mood."),
              background: z
                .enum([
                  "aurora",
                  "sunset",
                  "ocean",
                  "peach",
                  "noir",
                  "mint",
                  "duotone",
                  "cobalt",
                  "gradient-random",
                ])
                .nullable()
                .default(null)
                .describe("Grainy gradient mood for text-card backgrounds. ALWAYS use for text-card slides to keep feed visually consistent — avoid flat colors. Rotate moods across a carousel so no two slides share the same gradient. Moods: aurora (dark teal→pink→amber), sunset (warm orange/pink), ocean (cool cyan/indigo), peach (soft warm), noir (dark vibrant), mint (soft green), duotone (bold blue+orange), cobalt (deep blue). 'gradient-random' picks one."),
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
                background: input.background,
                branding: brand.branding!,
                brandDir: brand.brandDir,
                instagramHandle: brand.instagramHandle ?? "",
              });
              return `Branded image saved to: ${outputPath}`;
            },
          }),
          ...(isHtmlTokens(designSystem!) ? [
          betaZodTool({
            name: "carousel_cover",
            description:
              "Generate an editorial typographic cover slide (slide 1 of a carousel) using an HTML template. Produces high-quality designs with font pairing, accent colors, and decorative glyphs — far better than brand_image for thumbnails. Returns local PNG path. Available templates: 'headline-accent', 'quote-hero', 'stat-drop', 'question-lead', 'split-compare', 'kicker-led'.",
            inputSchema: z.object({
              templateId: z
                .enum(requireNonEmpty(designSystem!.templates.cover, "design system covers"))
                .describe("Template to use. 'headline-accent' = editorial serif headline with accent word, kicker, subtitle, optional decorative glyph and sticker (listicles, numbered hooks). 'quote-hero' = giant italic serif pull quote with left accent rule and oversized quotation mark (pithy statements, user quotes). 'stat-drop' = massive 520px serif stat with accent bar (numbers like '3X', '89%', '260+'). 'question-lead' = big italic question in serif with giant background question mark and accent-ruled answer tease (curiosity hooks, engagement bait). 'split-compare' = top/bottom Before/After comparison with center arrow divider (headline = BEFORE statement, subtitle = AFTER statement; great for old-way-vs-new-way, studio-vs-AI contrasts). 'kicker-led' = oversized 96px bold sans kicker as the hero element, small serif body line and huge index numeral in the corner (section headers, chapter covers, 'Part 1' style). 'dark-hero-cover' = dark charcoal paper with grain + grid + corner registration marks, giant condensed sans headline with dashed-bracketed serif italic accent word, optional blue speech-bubble sticker — premium/editorial/design-magazine feel, best for bold statements, design-focused content, or to break feed repetition. 'cream-numeric-cover' = cream paper with a red italic-serif kicker, a giant accent numeral (decorativeChar, e.g. '7') to the left of a huge bold condensed sans headline, and an italic-serif subtitle with a hand-drawn underline stroke — great for '[N] Signals / Signs / Tips' numeric leads. Optional blue speech-bubble sticker (stickerText). 'spec-annotated-cover' = cream paper in an architectural/design-spec aesthetic with hatched margin strips, red italic spec-number annotations (48, 32, 64…), corner registration marks, a red-bordered rounded-square number box (decorativeChar, e.g. '10'), a huge bold sans headline, a red italic-serif subtitle with hand-drawn underline, and a red squiggle arrow. Ideal for '[N] Mistakes / Rules / Myths' counterpoint covers where the number is the hero and the subtitle teases the tension."),
              kicker: z
                .string()
                .nullable()
                .describe("Short uppercase label above headline, e.g. 'AI PHOTO TIPS' or 'GUIDE'. null to omit."),
              headline: z
                .string()
                .describe("Main content. Meaning shifts per template: 'headline-accent' = bold 3-8 word hook. 'quote-hero' = the full quote sentence (10-18 words OK, renders as italic pull quote). 'stat-drop' = the giant stat itself ('3X', '89%', '260+', 'ZERO') — keep 1-4 chars, renders at 520px. 'question-lead' = the question itself (4-10 words, ends with '?'). 'split-compare' = the BEFORE statement (5-12 words, renders strikethrough). 'kicker-led' = a short serif italic follow-up line below the big kicker (5-10 words)."),
              accentWord: z
                .string()
                .nullable()
                .describe("Word or phrase from the headline to render in italic accent color. Must appear in headline. null for no accent."),
              subtitle: z
                .string()
                .nullable()
                .describe("Short line below headline. Meaning shifts per template: 'headline-accent' = sans explainer. 'quote-hero' = attribution (e.g. 'carephoto.art' — template auto-prepends em dash). 'stat-drop' = explainer of the stat ('more matches on average'). 'question-lead' = the answer tease ('Answer: probably what you already suspect'). 'split-compare' = REQUIRED — the AFTER statement that contrasts with headline (e.g. headline='Studio shoot $500', subtitle='AI edit $9'). 'kicker-led' = tiny signature line, like a byline."),
              decorativeChar: z
                .string()
                .nullable()
                .describe("Single large character/short string drawn behind or beside the composition. Applies to 'headline-accent' (big background glyph like '7' or '!') and 'kicker-led' (corner index like '01', '02'). Ignored by other templates. null to omit."),
              stickerText: z
                .string()
                .nullable()
                .describe("Optional blue speech-bubble sticker text, e.g. 'Until now' or 'Free inside'. Used by 'headline-accent' and 'stat-drop'. Ignored by 'quote-hero', 'question-lead', 'split-compare', 'kicker-led'. null to omit."),
              background: z
                .enum([
                  "cream",
                  "aurora",
                  "sunset",
                  "ocean",
                  "peach",
                  "noir",
                  "mint",
                  "duotone",
                  "cobalt",
                  "gradient-random",
                ])
                .nullable()
                .describe("Background style. 'cream' = editorial off-white paper with grid. Gradient moods: 'aurora' (dark teal→pink→amber, techy), 'sunset' (warm orange/pink on cream), 'ocean' (cool cyan/indigo on cream), 'peach' (soft warm cream), 'noir' (dark purple/blue moody), 'mint' (soft green/yellow calm), 'duotone' (bold blue+orange on cream), 'cobalt' (deep blue vibrant). 'gradient-random' picks one. null defaults to cream."),
              accentColor: z
                .string()
                .nullable()
                .describe("Hex color for accent word + kicker. null picks randomly from brand palette."),
              pageNumber: z.number().nullable().default(null).describe("Page number for indicator (null = no indicator)"),
              totalPages: z.number().nullable().default(null).describe("Total pages for indicator"),
            }),
            run: async (input) => {
              const outputPath = await renderCarouselCover({
                templateId: input.templateId,
                slots: {
                  kicker: input.kicker,
                  headline: input.headline,
                  accentWord: input.accentWord,
                  subtitle: input.subtitle,
                  decorativeChar: input.decorativeChar,
                  stickerText: input.stickerText,
                },
                background: input.background,
                accentColor: input.accentColor,
                pageNumber: input.pageNumber,
                totalPages: input.totalPages,
                branding: brand.branding!,
                brandDir: brand.brandDir,
                designSystemDir: designSystem!.rootDir,
                instagramHandle: brand.instagramHandle ?? "",
              });
              return `Cover saved to: ${outputPath}`;
            },
          }),
          betaZodTool({
            name: "body_slide",
            description:
              "Generate an editorial body slide (slide 2-N of a carousel) using an HTML template. Produces typographic slides that match the carousel_cover visual language — same fonts, gradients, and branding footer. Use for text-driven content slides; use brand_image for photo-led slides. Templates: 'body-list-item' (numbered tip with body copy), 'body-pullout' (italic serif insight + paragraph), 'body-quote' (testimonial + attribution), 'body-caption-led' (kicker + bold lead + paragraph).",
            inputSchema: z.object({
              templateId: z
                .enum(requireNonEmpty(designSystem!.templates.body, "design system body templates"))
                .describe("'body-list-item' = giant accent numeral + short heading + body paragraph (listicle points, numbered tips). 'body-pullout' = italic serif insight sentence with accent rule + supporting paragraph (key takeaways, mini-insights between sections). 'body-quote' = italic serif testimonial + em-dashed attribution (user quotes, expert pulls). 'body-caption-led' = tiny kicker label + heavy sans lead sentence + body paragraph (story beats, expanded explanations). 'dark-list-body' = dark charcoal paper with grain + grid + corner registration marks + top carousel progress bar + side chevrons; small serif kicker (e.g. 'Tip 3'), huge serif headline, optional pill-chip row (pass pipe-separated names in subtitle, e.g. 'Gill Sans | Optima | Aboreto'), optional arrow-bullet list (pass pipe-separated points in decorativeChar, e.g. 'Friendly | Approachable | Avoid for luxury'). Best for design-magazine aesthetic, numbered deep-dives, or feed-variety breaks. 'dark-bold-body' = same dark aesthetic but headline is HUGE BOLD CONDENSED SANS (not serif) — use when the headline is a STATEMENT rather than a name. Pass bullet points in decorativeChar as pipe-separated items (e.g. 'Juniors design screens | Seniors design systems | Consistency scales'). subtitle renders as a short closing line beneath the bullets. Great for 'Signal N: [statement]' tips. 'dark-compare-body' = dark aesthetic with two side-by-side ✓/✕ mock panels showing conceptual good-vs-bad — the left panel is clean/airy, the right is cluttered with accent-striped highlights. Pass panel labels in decorativeChar as 'Good label | Bad label' (e.g. 'Clear structure | Hard to read'). headline = the tip title. subtitle = the 'Note' callout paragraph below the panels. Best for DO/DON'T, good-vs-bad, this-not-that comparisons."),
              kicker: z
                .string()
                .nullable()
                .describe("Short uppercase label. Required for 'body-caption-led'. Ignored by other body templates. null to omit."),
              headline: z
                .string()
                .describe("Main text. Meaning shifts per template: 'body-list-item' = short heading (3-7 words). 'body-pullout' = insight sentence (8-16 words, italic serif). 'body-quote' = the quote itself (10-25 words). 'body-caption-led' = bold lead sentence (6-12 words)."),
              accentWord: z
                .string()
                .nullable()
                .describe("Word or phrase from headline to emphasize (serif italic accent color). Must appear in headline. null for no accent."),
              subtitle: z
                .string()
                .describe("Supporting copy. Meaning shifts per template: 'body-list-item' = body paragraph (30-60 words). 'body-pullout' = supporting paragraph (20-50 words). 'body-quote' = attribution (auto-prefixed with em-dash, e.g. 'Sarah, Hinge user'). 'body-caption-led' = body paragraph (40-80 words)."),
              decorativeChar: z
                .string()
                .nullable()
                .describe("Index numeral for 'body-list-item' (e.g. '01', '02', '03'). Ignored by other templates. null to omit."),
              background: z
                .enum([
                  "cream",
                  "aurora",
                  "sunset",
                  "ocean",
                  "peach",
                  "noir",
                  "mint",
                  "duotone",
                  "cobalt",
                  "gradient-random",
                ])
                .nullable()
                .describe("Background style. MUST differ from the carousel cover's background mood — rotate across slides. 'cream' = editorial off-white. Gradient moods match carousel_cover options."),
              accentColor: z
                .string()
                .nullable()
                .describe("Hex color for accent word + rule. null picks a mood-safe accent."),
              pageNumber: z.number().nullable().default(null).describe("Page number (REQUIRED for carousel slides, e.g. 2, 3, 4)"),
              totalPages: z.number().nullable().default(null).describe("Total pages in carousel"),
            }),
            run: async (input) => {
              const outputPath = await renderCarouselCover({
                templateId: input.templateId,
                slots: {
                  kicker: input.kicker,
                  headline: input.headline,
                  accentWord: input.accentWord,
                  subtitle: input.subtitle,
                  decorativeChar: input.decorativeChar,
                  stickerText: null,
                },
                background: input.background,
                accentColor: input.accentColor,
                pageNumber: input.pageNumber,
                totalPages: input.totalPages,
                branding: brand.branding!,
                brandDir: brand.brandDir,
                designSystemDir: designSystem!.rootDir,
                instagramHandle: brand.instagramHandle ?? "",
              });
              return `Body slide saved to: ${outputPath}`;
            },
          }),
          betaZodTool({
            name: "photo_overlay",
            description:
              "Apply an editorial overlay template to a photo. Use for photo-led single-image posts (or photo slides in a carousel) — produces magazine-quality composition that outperforms brand_image's plain text overlay. Templates: 'photo-caption-bar' (cream caption bar at bottom with serif headline + subtitle — magazine feel), 'photo-quote-center' (centered italic serif quote with cinematic dark scrim — attention-grabbing), 'photo-editorial-stack' (top-left kicker + huge serif headline with gradient scrim — magazine cover), 'photo-chip-corner' (small cream chip at bottom-right — minimal, lets the photo breathe), 'photo-prompt-cover' (PROMPT-SHARE cover slide — photo bg + cream overlay card with the prompt TITLE, model badge, swipe-for-prompt hint, and a tilted 'FREE PROMPT' accent ribbon; use as slide 1 of a Prompt Share carousel), 'photo-prompt-card' (PROMPT-SHARE final slide — photo bg + large cream overlay card holding the FULL PROMPT TEXT with model badge, prompt ID, accent rule, and a 'tap to copy' CTA; use as the last slide of a Prompt Share carousel). Returns local PNG path.",
            inputSchema: z.object({
              templateId: z
                .enum(requireNonEmpty(designSystem!.templates.photoOverlay, "design system photo overlays"))
                .describe("Template to apply over the photo."),
              imageUrl: z
                .string()
                .describe("URL or local path to the source photo (the background image)."),
              kicker: z
                .string()
                .nullable()
                .describe("Short uppercase label. Used by all templates except 'photo-quote-center' (ignored there). For 'photo-prompt-cover' this becomes the small uppercase eyebrow above the prompt title (e.g. 'PROMPT INSIDE', 'TODAY\\'S PROMPT'). null to omit."),
              headline: z
                .string()
                .describe("Main text. 'photo-caption-bar' = serif headline (6-12 words). 'photo-quote-center' = italic serif quote (6-18 words). 'photo-editorial-stack' = huge serif headline (4-9 words). 'photo-chip-corner' = short serif line (3-7 words). For 'photo-prompt-cover' / 'photo-prompt-card' the headline is ignored — pass the prompt title via promptTitle instead. Just send an empty string for those two templates."),
              accentWord: z
                .string()
                .nullable()
                .describe("Word or phrase from headline to emphasize. Must appear in headline. null for no accent. Ignored by 'photo-prompt-cover' / 'photo-prompt-card'."),
              subtitle: z
                .string()
                .nullable()
                .describe("Supporting line. 'photo-caption-bar' = sans subtitle (0-16 words). 'photo-quote-center' = attribution (auto-prepended em-dash, e.g. 'carephoto.art'). 'photo-editorial-stack' = sans subtitle. 'photo-chip-corner' = tiny caption. null to omit. Ignored by 'photo-prompt-cover' / 'photo-prompt-card'."),
              promptTitle: z
                .string()
                .nullable()
                .default(null)
                .describe("Prompt-share only — the title of the prompt being shared (e.g. 'Elevator — Varsity Jacket Portrait'). REQUIRED for 'photo-prompt-cover' (renders as a huge serif title in the overlay card) and 'photo-prompt-card' (renders as a smaller serif title above the prompt body)."),
              promptText: z
                .string()
                .nullable()
                .default(null)
                .describe("Prompt-share only — the FULL prompt text. REQUIRED for 'photo-prompt-card' (renders the entire prompt inside the overlay card; font size auto-scales by length up to ~2000 chars). Ignored by other templates."),
              promptId: z
                .string()
                .nullable()
                .default(null)
                .describe("Prompt-share only — the prompt bank ID (e.g. 'elevator-varsity-jacket'). Optional for 'photo-prompt-card' (renders as '#id' under the title) so viewers can find the prompt in the bank."),
              promptModel: z
                .string()
                .nullable()
                .default(null)
                .describe("Prompt-share only — the recommended model for this prompt (e.g. 'Flux Pro Kontext Max', 'Nano Banana 2'). Renders as an outlined pill badge in the overlay card on both 'photo-prompt-cover' and 'photo-prompt-card'. Pull this from the prompt bank entry's 'model' field."),
              ribbonText: z
                .string()
                .nullable()
                .default(null)
                .describe("Prompt-share cover only — the floating accent ribbon copy in the upper-left of 'photo-prompt-cover'. Defaults to 'Free prompt inside'. Keep it short (2-4 words, all caps will be applied)."),
              swipeHint: z
                .string()
                .nullable()
                .default(null)
                .describe("Prompt-share cover only — the bottom-row CTA on 'photo-prompt-cover'. Defaults to 'Swipe for the prompt'. Will render in caps with an arrow."),
              swipeAside: z
                .string()
                .nullable()
                .default(null)
                .describe("Prompt-share cover only — optional small italic aside next to the swipe hint on 'photo-prompt-cover' (e.g. 'Same prompt, 4 looks'). null to omit."),
              accentColor: z
                .string()
                .nullable()
                .describe("Hex color for accent word, kicker, chip label, prompt-card rule, and ribbon. null picks from brand palette."),
              pageNumber: z.number().nullable().default(null).describe("Page number for indicator (null = no indicator)"),
              totalPages: z.number().nullable().default(null).describe("Total pages for indicator"),
            }),
            run: async (input) => {
              const outputPath = await renderPhotoOverlay({
                templateId: input.templateId,
                photoSource: input.imageUrl,
                slots: {
                  kicker: input.kicker,
                  headline: input.headline,
                  accentWord: input.accentWord,
                  subtitle: input.subtitle,
                  promptTitle: input.promptTitle,
                  promptText: input.promptText,
                  promptId: input.promptId,
                  promptModel: input.promptModel,
                  ribbonText: input.ribbonText,
                  swipeHint: input.swipeHint,
                  swipeAside: input.swipeAside,
                },
                accentColor: input.accentColor,
                pageNumber: input.pageNumber,
                totalPages: input.totalPages,
                branding: brand.branding!,
                brandDir: brand.brandDir,
                designSystemDir: designSystem!.rootDir,
                instagramHandle: brand.instagramHandle ?? "",
              });
              return `Photo overlay saved to: ${outputPath}`;
            },
          }),
          ] : []),
          betaZodTool({
            name: "brand_carousel",
            description:
              "Apply brand overlays to multiple slides for a carousel post. Auto-numbers pages. DO NOT pass a cover produced by carousel_cover here — that cover is already fully branded and will get double-branded. For carousels that start with carousel_cover, call brand_image individually for each remaining slide with explicit pageNumber/totalPages. Use brand_carousel only when you do NOT have a carousel_cover (pure photo carousels or text-only carousels). Returns local paths of all branded images.",
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
                    .describe("Flat hex color for text cards (fallback when no background mood is set)"),
                  background: z
                    .enum([
                      "aurora",
                      "sunset",
                      "ocean",
                      "peach",
                      "noir",
                      "mint",
                      "duotone",
                      "cobalt",
                      "gradient-random",
                    ])
                    .nullable()
                    .default(null)
                    .describe("Grainy gradient mood for text cards. Rotate across slides so no two share the same mood."),
                })
              ).describe("Array of slide definitions"),
            }),
            run: async (input) => {
              const paths = await brandCarousel(
                input.slides.map((s: any) => ({
                  imageSource: s.imageUrl,
                  textOverlay: s.textOverlay,
                  textPosition: s.textPosition,
                  isThumbnail: s.isThumbnail,
                  backgroundColor: s.backgroundColor,
                  background: s.background,
                })),
                brand.branding!,
                brand.brandDir,
                brand.instagramHandle ?? ""
              );
              return `Branded ${paths.length} slides:\n${paths.map((p, i) => `  Slide ${i + 1}: ${p}`).join("\n")}`;
            },
          }),
          ...(isReactJsx(designSystem!) ? buildReactJsxTools(designSystem as ReactJsxManifest & { rootDir: string }, brand) : []),
        ]
      : []),

    betaZodTool({
      name: "send_notification",
      description:
        "Send an email notification to the brand owner with a summary or alert.",
      inputSchema: z.object({
        subject: z.string().describe("Email subject"),
        body: z.string().describe("Email body"),
      }),
      run: async (input) => {
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

  // Pull fresh analytics from Postiz before the agent reads get_post_performance,
  // so today's decisions are informed by yesterday's numbers. Fails soft — if
  // Postiz is unreachable the agent still runs with whatever's already in the DB.
  try {
    await ingestAnalytics(brand, db);
  } catch (err) {
    console.warn(
      `[Agent] analytics ingestion failed: ${err instanceof Error ? err.message : err}`
    );
  }

  console.log(`[Agent] Starting daily run for ${brand.name}...`);

  const runner = client.beta.messages.toolRunner({
    model: "claude-sonnet-4-6",
    max_tokens: 16384,
    thinking: { type: "adaptive" },
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Run the daily marketing cycle for ${brand.name}. Today is ${new Date().toISOString().split("T")[0]}. Research competitors, check trends, review past performance, and decide on today's content strategy. If you post, schedule it. Always send a summary notification at the end.`,
      },
    ],
    tools,
    max_iterations: 20,
  });

  let iter = 0;
  let finalMessage: any = null;
  for await (const msg of runner as any) {
    iter++;
    const toolUses = (msg.content ?? []).filter((b: any) => b.type === "tool_use");
    const textBlocks = (msg.content ?? []).filter((b: any) => b.type === "text");
    console.log(
      `[Agent] iter=${iter} stop=${msg.stop_reason} tools=[${toolUses.map((t: any) => t.name).join(", ")}] text=${textBlocks[0]?.text?.slice(0, 120) ?? ""}`
    );
    finalMessage = msg;
  }

  const textBlock = finalMessage?.content?.find((b: any) => b.type === "text");
  if (textBlock && textBlock.type === "text") {
    console.log(`[Agent] Run complete after ${iter} iters. Final message: ${textBlock.text.slice(0, 200)}`);
  } else {
    console.log(`[Agent] Run complete after ${iter} iters. (no text in final message, stop=${finalMessage?.stop_reason})`);
  }
}
