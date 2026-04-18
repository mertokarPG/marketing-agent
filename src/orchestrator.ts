import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import Database from "better-sqlite3";
import type { BrandConfig } from "./config/load-brand.js";
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
import {
  insertPost,
  insertCompetitorSnapshot,
  insertContentCalendarEntry,
  updateContentCalendarStatus,
  getUsedPromptIds,
} from "./db/queries.js";

export function buildTools(brand: BrandConfig, db: Database.Database) {
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

        if (result.includes("successfully")) {
          insertPost(db, {
            brand_id: brand.id,
            caption: input.caption,
            hashtags: input.hashtags,
            image_url: input.images[0],
            content_theme: "scheduled",
            posted_at: input.scheduledTime ?? new Date().toISOString(),
            source_images: input.promptIds,
          });
          updateContentCalendarStatus(db, calendarId, "posted");
        } else {
          updateContentCalendarStatus(db, calendarId, "planned");
        }

        return result;
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
          betaZodTool({
            name: "carousel_cover",
            description:
              "Generate an editorial typographic cover slide (slide 1 of a carousel) using an HTML template. Produces high-quality designs with font pairing, accent colors, and decorative glyphs — far better than brand_image for thumbnails. Returns local PNG path. Available templates: 'headline-accent', 'quote-hero', 'stat-drop', 'question-lead', 'split-compare', 'kicker-led'.",
            inputSchema: z.object({
              templateId: z
                .enum([
                  "headline-accent",
                  "quote-hero",
                  "stat-drop",
                  "question-lead",
                  "split-compare",
                  "kicker-led",
                ])
                .describe("Template to use. 'headline-accent' = editorial serif headline with accent word, kicker, subtitle, optional decorative glyph and sticker (listicles, numbered hooks). 'quote-hero' = giant italic serif pull quote with left accent rule and oversized quotation mark (pithy statements, user quotes). 'stat-drop' = massive 520px serif stat with accent bar (numbers like '3X', '89%', '260+'). 'question-lead' = big italic question in serif with giant background question mark and accent-ruled answer tease (curiosity hooks, engagement bait). 'split-compare' = top/bottom Before/After comparison with center arrow divider (headline = BEFORE statement, subtitle = AFTER statement; great for old-way-vs-new-way, studio-vs-AI contrasts). 'kicker-led' = oversized 96px bold sans kicker as the hero element, small serif body line and huge index numeral in the corner (section headers, chapter covers, 'Part 1' style)."),
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
                instagramHandle: brand.instagramHandle ?? "",
              });
              return `Cover saved to: ${outputPath}`;
            },
          }),
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
                input.slides.map((s) => ({
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
