import { readFileSync } from "fs";
import path from "path";

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
  category?: string
): string {
  const prompts = loadPrompts(promptBankPath);

  const filtered = category
    ? prompts.filter((p) => p.category === category)
    : prompts;

  if (filtered.length === 0) {
    const categories = [...new Set(prompts.map((p) => p.category))];
    return `No prompts found for category "${category}". Available categories: ${categories.join(", ")}`;
  }

  const entries = filtered
    .map(
      (p) =>
        `- [${p.category}] ${p.title}\n  ${p.description}\n  Image: https://${domain}${p.image}\n  Prompt: ${p.prompt.slice(0, 120)}...`
    )
    .join("\n\n");

  return `Prompt Bank (${filtered.length} items${category ? `, category: ${category}` : ""}):\n\n${entries}`;
}
