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
