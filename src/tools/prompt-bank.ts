import { readFileSync } from "fs";

interface PromptEntry {
  id: string;
  title: string;
  prompt: string;
  image: string;
  category: string;
  model: string;
  description: string;
}

let cachedPrompts: PromptEntry[] | null = null;

function loadPrompts(promptBankPath: string): PromptEntry[] {
  if (cachedPrompts) return cachedPrompts;
  const raw = readFileSync(promptBankPath, "utf-8");
  cachedPrompts = JSON.parse(raw) as PromptEntry[];
  return cachedPrompts;
}

export function browsePromptBank(
  promptBankPath: string,
  domain: string,
  category: string | undefined,
  usedIds: Set<string>
): string {
  const prompts = loadPrompts(promptBankPath);

  const filteredByCategory = category
    ? prompts.filter((p) => p.category === category)
    : prompts;

  // Hide already-used prompts from the agent so duplicates become impossible.
  const available = filteredByCategory.filter((p) => !usedIds.has(p.id));
  const hiddenCount = filteredByCategory.length - available.length;

  if (filteredByCategory.length === 0) {
    const categories = [...new Set(prompts.map((p) => p.category))];
    return `No prompts found for category "${category}". Available categories: ${categories.join(", ")}`;
  }

  if (available.length === 0) {
    return `All ${filteredByCategory.length} prompts in category "${category ?? "all"}" have already been used. Pick a different category or request new prompts be added.`;
  }

  const entries = available
    .map(
      (p) =>
        `- [${p.category}] ${p.title} (ID: ${p.id})\n  ${p.description}\n  Image: https://${domain}${p.image}\n  Prompt: ${p.prompt.slice(0, 120)}...`
    )
    .join("\n\n");

  const header = `Prompt Bank (${available.length} available${hiddenCount > 0 ? `, ${hiddenCount} already used and hidden` : ""}${category ? `, category: ${category}` : ""}):`;

  return `${header}\n\nWhen scheduling a post with one of these, pass the prompt IDs to schedule_post's 'promptIds' param so they're tracked as used. Mention the prompt ID and link to https://${domain}/prompt-bank in the caption.\n\n${entries}`;
}
