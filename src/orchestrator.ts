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

// Tool definition type used by buildTools and the agentic loop
export interface AgentTool<TInput = Record<string, unknown>> {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  execute: (input: TInput) => Promise<string>;
  // Anthropic API-compatible JSON schema (derived from inputSchema)
  jsonSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

function zodToJsonSchema(schema: z.ZodObject<z.ZodRawShape>): {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
} {
  const shape = schema.shape;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    const field = value as z.ZodTypeAny;
    const isOptional =
      field instanceof z.ZodOptional || field instanceof z.ZodDefault;
    const inner = isOptional ? (field as z.ZodOptional<z.ZodTypeAny>)._def.innerType : field;

    let prop: Record<string, unknown> = {};
    const description: string | undefined =
      (inner as z.ZodTypeAny & { description?: string }).description;
    if (description) prop.description = description;

    if (inner instanceof z.ZodString) {
      prop.type = "string";
    } else if (inner instanceof z.ZodNumber) {
      prop.type = "number";
    } else if (inner instanceof z.ZodBoolean) {
      prop.type = "boolean";
    } else if (inner instanceof z.ZodArray) {
      prop.type = "array";
      prop.items = { type: "string" };
    } else {
      prop.type = "string";
    }

    properties[key] = prop;
    if (!isOptional) {
      required.push(key);
    }
  }

  return { type: "object", properties, ...(required.length > 0 ? { required } : {}) };
}

export function buildTools(brand: BrandConfig, db: Database.Database): AgentTool[] {
  const scrapeCompetitorSchema = z.object({
    name: z.string().describe("Competitor name"),
    url: z.string().url().describe("URL to scrape"),
  });

  const searchTrendsSchema = z.object({
    keywords: z.array(z.string()).describe("Keywords to search for trends"),
  });

  const getRecentPostsSchema = z.object({
    limit: z.number().default(10).describe("Number of recent posts to retrieve"),
  });

  const getPostPerformanceSchema = z.object({
    limit: z.number().default(10).describe("Number of posts to get performance for"),
  });

  const schedulePostSchema = z.object({
    caption: z.string().describe("Post caption"),
    hashtags: z.array(z.string()).describe("Hashtags for the post"),
    imageUrl: z.string().url().describe("URL to the post image"),
    scheduledTime: z
      .string()
      .optional()
      .describe("ISO timestamp for when to post (optional, posts immediately if omitted)"),
  });

  const sendNotificationSchema = z.object({
    subject: z.string().describe("Email subject"),
    body: z.string().describe("Email body"),
  });

  return [
    {
      name: "scrape_competitor",
      description:
        "Scrape a competitor's website to analyze their recent content, marketing strategy, and engagement patterns.",
      inputSchema: scrapeCompetitorSchema,
      jsonSchema: zodToJsonSchema(scrapeCompetitorSchema),
      execute: async (input: Record<string, unknown>) => {
        const { name, url } = input as z.infer<typeof scrapeCompetitorSchema>;
        const result = await scrapeCompetitor(name, url);
        insertCompetitorSnapshot(db, {
          brand_id: brand.id,
          competitor_name: name,
          content_summary: result,
          engagement_notes: "",
        });
        return result;
      },
    },
    {
      name: "search_trends",
      description:
        "Search the web for trending topics, hashtags, and content angles related to given keywords.",
      inputSchema: searchTrendsSchema,
      jsonSchema: zodToJsonSchema(searchTrendsSchema),
      execute: async (input: Record<string, unknown>) => {
        const { keywords } = input as z.infer<typeof searchTrendsSchema>;
        return searchTrends(keywords);
      },
    },
    {
      name: "get_recent_posts",
      description:
        "Get recent posts for the brand to review what content has been published.",
      inputSchema: getRecentPostsSchema,
      jsonSchema: zodToJsonSchema(getRecentPostsSchema),
      execute: async (input: Record<string, unknown>) => {
        const { limit } = input as z.infer<typeof getRecentPostsSchema>;
        return getRecentPostsTool(db, brand.id, limit ?? 10);
      },
    },
    {
      name: "get_post_performance",
      description:
        "Get performance analytics for recent posts to understand what content performs well.",
      inputSchema: getPostPerformanceSchema,
      jsonSchema: zodToJsonSchema(getPostPerformanceSchema),
      execute: async (input: Record<string, unknown>) => {
        const { limit } = input as z.infer<typeof getPostPerformanceSchema>;
        return getPostPerformanceTool(db, brand.id, limit ?? 10);
      },
    },
    {
      name: "schedule_post",
      description:
        "Schedule a post to Instagram via Postiz. Always record the content in the content calendar first.",
      inputSchema: schedulePostSchema,
      jsonSchema: zodToJsonSchema(schedulePostSchema),
      execute: async (input: Record<string, unknown>) => {
        const typed = input as z.infer<typeof schedulePostSchema>;
        const calendarId = insertContentCalendarEntry(db, {
          brand_id: brand.id,
          planned_date: new Date().toISOString().split("T")[0],
          theme: "scheduled",
          caption_draft: typed.caption,
          hashtags: typed.hashtags,
          reasoning: "Scheduled via agent",
        });

        const result = await schedulePost(typed);

        if (result.includes("successfully")) {
          insertPost(db, {
            brand_id: brand.id,
            caption: typed.caption,
            hashtags: typed.hashtags,
            image_url: typed.imageUrl,
            content_theme: "scheduled",
            posted_at: typed.scheduledTime ?? new Date().toISOString(),
          });
          updateContentCalendarStatus(db, calendarId, "posted");
        } else {
          updateContentCalendarStatus(db, calendarId, "planned");
        }

        return result;
      },
    },
    {
      name: "send_notification",
      description:
        "Send an email notification to the brand owner with a summary or alert.",
      inputSchema: sendNotificationSchema,
      jsonSchema: zodToJsonSchema(sendNotificationSchema),
      execute: async (input: Record<string, unknown>) => {
        const { subject, body } = input as z.infer<typeof sendNotificationSchema>;
        return sendNotification(subject, body);
      },
    },
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

  // Build Anthropic-compatible tool definitions from our AgentTool array
  const anthropicTools: Anthropic.Tool[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.jsonSchema,
  }));

  const toolMap = new Map(tools.map((t) => [t.name, t]));

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Run the daily marketing cycle for ${brand.name}. Today is ${new Date().toISOString().split("T")[0]}. Research competitors, check trends, review past performance, and decide on today's content strategy. If you post, schedule it. Always send a summary notification at the end.`,
    },
  ];

  let done = false;
  while (!done) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      messages,
      tools: anthropicTools,
    });

    // Add assistant response to message history
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") {
      done = true;
      const textBlock = response.content.find((b) => b.type === "text");
      console.log(
        `[Agent] Run complete. Final message: ${textBlock ? (textBlock as Anthropic.TextBlock).text.slice(0, 200) : "(no text)"}`
      );
    } else if (response.stop_reason === "tool_use") {
      // Execute all tool calls and collect results
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        const tool = toolMap.get(block.name);
        if (!tool) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Unknown tool: ${block.name}`,
            is_error: true,
          });
          continue;
        }

        try {
          const result = await tool.execute(block.input as Record<string, unknown>);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: typeof result === "string" ? result : JSON.stringify(result),
          });
        } catch (error) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: error instanceof Error ? error.message : String(error),
            is_error: true,
          });
        }
      }

      messages.push({ role: "user", content: toolResults });
    } else {
      done = true;
    }
  }
}
