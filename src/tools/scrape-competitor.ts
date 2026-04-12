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
