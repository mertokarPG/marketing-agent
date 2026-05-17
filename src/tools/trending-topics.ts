import Anthropic from "@anthropic-ai/sdk";
import type Database from "better-sqlite3";
import { getTrendsSince, type TrendRow } from "../db/queries.js";
import type { BrandConfig } from "../config/load-brand.js";

export interface GetTrendingTopicsInput {
  lookback_hours?: number;
  max_topics?: number;
}

interface Topic {
  title: string;
  summary: string;
  why_trending: string;
  sources: string[]; // distinct source_ids that cover this topic
  example_urls: string[]; // up to 3 representative URLs
  relevance: "high" | "medium" | "low"; // fit with AI photo / design / photography / creator tooling
}

interface ClusterResponse {
  topics: Topic[];
  skipped_reason?: string;
}

// Keep the per-item footprint small so a 48h scrape (~500 items) stays under
// Haiku's context window. Titles are fully preserved, summaries get capped.
function formatItemsForClustering(items: TrendRow[]): string {
  return items
    .map((t, i) => {
      const s = t.summary ? t.summary.replace(/\s+/g, " ").slice(0, 180) : "";
      const score = t.score != null ? ` [${t.score}pts]` : "";
      return `${i + 1}. [${t.source_id}/${t.category}]${score} ${t.title}${s ? ` — ${s}` : ""}`;
    })
    .join("\n");
}

function buildSystem(brand: BrandConfig): string {
  // Brand-specific relevance description. Falls back to the brand's niche/description
  // if no explicit themes are configured — good enough to unblock new tenants.
  const themes =
    brand.hotTopics?.relevantThemes ??
    `${brand.niche}. ${brand.description}`;

  return `You are a news-desk editor for a marketing agent that runs for ${brand.name} (${brand.domain}). Your job: collapse a firehose of individual posts/articles into the underlying TOPICS — the stories that multiple independent outlets are talking about.

CRITICAL DEFINITION OF A "TOPIC":
- A topic is a real-world event, launch, controversy, or theme that AT LEAST 2 DISTINCT SOURCES have covered independently.
- A single viral Reddit post with a funny anecdote is NOT a topic. Ignore it.
- A single HN frontpage article nobody else is talking about is NOT a topic unless it's a major launch (new product, company acquisition, court ruling, regulatory decision, etc.).
- Real topics look like: major product launches, industry-wide controversies, regulatory/legal rulings, cross-outlet editorial themes.
- Fake topics look like: a single person's anecdote going viral in one subreddit, one creator's portfolio post, one-off memes.

RANKING:
- Rank by number of distinct SOURCES covering the topic, not engagement score.
- Tie-breaker: total aggregate score across sources.
- Mark relevance to ${brand.name}'s domain below. "high" = directly usable for a trend-reaction post today. "medium" = adjacent/tangentially useful. "low" = unrelated to this brand but genuinely trending.

${brand.name.toUpperCase()} RELEVANCE GUIDE:
${themes}

OUTPUT:
- Return STRICT JSON matching the provided schema.
- If there are no real cross-source topics in the input, return an empty topics array and explain in skipped_reason.
- Do not invent topics. Do not merge unrelated items just to bulk up a topic.
- Keep each topic's summary to 1-2 sentences. why_trending is 1 sentence on why it's spiking right now.`;
}

const TOOL_SCHEMA = {
  name: "return_topics",
  description: "Return the clustered trending topics.",
  input_schema: {
    type: "object" as const,
    properties: {
      topics: {
        type: "array",
        description:
          "The trending topics, ranked by number of distinct sources covering them. Empty if no real cross-source topics exist in the input.",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short topic title (e.g. 'Qwen3.6 launches')." },
            summary: {
              type: "string",
              description: "1-2 sentence neutral description of what happened.",
            },
            why_trending: {
              type: "string",
              description: "1 sentence on why this is spiking now / who cares.",
            },
            sources: {
              type: "array",
              description: "Distinct source_ids (as appearing in the input) that cover this topic.",
              items: { type: "string" },
            },
            example_urls: {
              type: "array",
              description: "Up to 3 URLs from the input that best represent the coverage.",
              items: { type: "string" },
            },
            relevance: {
              type: "string",
              enum: ["high", "medium", "low"],
              description:
                "Relevance to carephoto.art's domain (AI / image gen / photography / design / creator tooling / brand marketing).",
            },
          },
          required: ["title", "summary", "why_trending", "sources", "example_urls", "relevance"],
        },
      },
      skipped_reason: {
        type: "string",
        description: "Why no topics were returned, if topics is empty.",
      },
    },
    required: ["topics"],
  },
};

async function clusterWithClaude(
  brand: BrandConfig,
  items: TrendRow[],
  maxTopics: number
): Promise<ClusterResponse> {
  const client = new Anthropic();
  const itemsBlock = formatItemsForClustering(items);

  const userContent = `Below are ${items.length} items scraped from curated feeds. Cluster them into AT MOST ${maxTopics} real trending TOPICS using the definition in the system prompt. Use return_topics to reply.

ITEMS:
${itemsBlock}`;

  const res = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    system: buildSystem(brand),
    tools: [TOOL_SCHEMA],
    tool_choice: { type: "tool", name: "return_topics" },
    messages: [{ role: "user", content: userContent }],
  });

  const toolUse = res.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a tool_use block for return_topics");
  }
  return toolUse.input as ClusterResponse;
}

function formatDigest(
  resp: ClusterResponse,
  meta: { lookbackHours: number; itemCount: number }
): string {
  const header = `Trending topics — lookback ${meta.lookbackHours}h, clustered from ${meta.itemCount} items`;

  if (resp.topics.length === 0) {
    return `${header}\n\nNo cross-source topics detected.${
      resp.skipped_reason ? ` Reason: ${resp.skipped_reason}` : ""
    }`;
  }

  // Sort: relevance (high > medium > low), then source breadth
  const order = { high: 0, medium: 1, low: 2 } as const;
  const sorted = [...resp.topics].sort((a, b) => {
    const r = order[a.relevance] - order[b.relevance];
    if (r !== 0) return r;
    return b.sources.length - a.sources.length;
  });

  const sections: string[] = [header, ""];
  sorted.forEach((t, i) => {
    const relTag =
      t.relevance === "high" ? "🎯 HIGH" : t.relevance === "medium" ? "○ medium" : "· low";
    sections.push(
      `${i + 1}. ${t.title}  [${relTag} · ${t.sources.length} source${t.sources.length === 1 ? "" : "s"}]`
    );
    sections.push(`   ${t.summary}`);
    sections.push(`   Why now: ${t.why_trending}`);
    sections.push(`   Sources: ${t.sources.join(", ")}`);
    for (const url of t.example_urls.slice(0, 3)) {
      sections.push(`   • ${url}`);
    }
    sections.push("");
  });

  return sections.join("\n");
}

export async function getTrendingTopics(
  db: Database.Database,
  brand: BrandConfig,
  input: GetTrendingTopicsInput = {}
): Promise<string> {
  const { lookback_hours = 48, max_topics = 10 } = input;

  const items = getTrendsSince(db, { lookbackHours: lookback_hours });
  if (items.length === 0) {
    return `Trending topics — lookback ${lookback_hours}h, 0 items.\n\nThe scraper has not populated the trends table yet.`;
  }

  const resp = await clusterWithClaude(brand, items, max_topics);
  return formatDigest(resp, { lookbackHours: lookback_hours, itemCount: items.length });
}
