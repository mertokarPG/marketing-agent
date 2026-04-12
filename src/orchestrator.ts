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
import {
  insertPost,
  insertCompetitorSnapshot,
  insertContentCalendarEntry,
  updateContentCalendarStatus,
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
        "Schedule a post to Instagram via Postiz. Always record the content in the content calendar first.",
      inputSchema: z.object({
        caption: z.string().describe("Post caption"),
        hashtags: z.array(z.string()).describe("Hashtags for the post"),
        imageUrl: z.string().url().describe("URL to the post image"),
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
    `[Agent] Run complete. Final message: ${textBlock ? (textBlock as { text: string }).text.slice(0, 200) : "(no text)"}`
  );
}
