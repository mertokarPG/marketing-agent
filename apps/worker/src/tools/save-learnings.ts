import { upsertInsight, type BrandConfig, type Db } from "@carepost/core";
import type { ToolContext } from "../runtime/types.js";

export interface SaveLearningsInput { learnings: string[] }

const MAX_LEARNING_CHARS = 200;

/** Stores the weekly plan's 2–3 plain-language learnings as the brand's insight for this ISO week. */
export async function saveLearnings(db: Db, brand: BrandConfig, ctx: ToolContext, input: SaveLearningsInput): Promise<string> {
  if (ctx.kind !== "weekly_plan" || !ctx.periodKey) return "save_learnings rejected: only the weekly plan saves learnings.";
  const learnings = input.learnings.map((l) => l.trim()).filter((l) => l.length > 0);
  if (learnings.length < 2 || learnings.length > 3) return "save_learnings rejected: give 2–3 learnings.";
  if (learnings.some((l) => l.length > MAX_LEARNING_CHARS))
    return `save_learnings rejected: keep each learning under ${MAX_LEARNING_CHARS} characters.`;
  await upsertInsight(db, brand.dbId, ctx.periodKey, learnings.join("\n"));
  return `Saved ${learnings.length} learnings for ${ctx.periodKey}.`;
}
