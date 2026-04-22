import { describe, it, expect, vi, beforeEach } from "vitest";
import { browsePromptBank } from "../../src/tools/prompt-bank.js";
import path from "path";
import { writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";

const testPrompts = [
  {
    id: "test-portrait",
    title: "Studio Portrait",
    prompt: "A professional studio portrait with soft lighting",
    image: "/promptbank/images/test1.webp",
    category: "portrait",
    model: "Flux Pro",
    description: "Professional portrait photography",
  },
  {
    id: "test-fashion",
    title: "Street Fashion",
    prompt: "A street style fashion photo in urban setting",
    image: "/promptbank/images/test2.webp",
    category: "fashion",
    model: "Flux Pro",
    description: "Urban fashion photography",
  },
];

const tmpPath = path.join(tmpdir(), "test-prompts.json");
writeFileSync(tmpPath, JSON.stringify(testPrompts));

describe("browsePromptBank", () => {
  it("returns all prompts when no category filter", () => {
    const result = browsePromptBank(tmpPath, "test.com", undefined, new Set());
    expect(result).toContain("Studio Portrait");
    expect(result).toContain("Street Fashion");
    expect(result).toContain("2 items");
  });

  it("filters by category", () => {
    const result = browsePromptBank(tmpPath, "test.com", "portrait", new Set());
    expect(result).toContain("Studio Portrait");
    expect(result).not.toContain("Street Fashion");
    expect(result).toContain("category: portrait");
  });

  it("returns public URLs with domain", () => {
    const result = browsePromptBank(tmpPath, "test.com", "portrait", new Set());
    expect(result).toContain("https://test.com/promptbank/images/test1.webp");
  });

  it("shows available categories for invalid filter", () => {
    const result = browsePromptBank(tmpPath, "test.com", "nonexistent", new Set());
    expect(result).toContain("No prompts found");
    expect(result).toContain("portrait");
    expect(result).toContain("fashion");
  });
});
