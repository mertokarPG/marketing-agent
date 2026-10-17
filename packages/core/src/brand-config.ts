import path from "node:path";
import { z } from "zod";
import type { AssetRow, BrandRow } from "./repo/brands.js";
import { WEEKDAYS, type Weekday } from "./time.js";

export const CompetitorSchema = z.object({
  name: z.string(),
  instagram: z.string().optional(),
  website: z.string().optional(),
});

export const BrandColorsSchema = z.object({
  primary: z.string().default("#6C3CE1"),
  secondary: z.string().default("#1a1a2e"),
  accent: z.string().default("#E14ECE"),
});

export const BrandingSchema = z.object({
  enabled: z.boolean(),
  logoPath: z.string(),
  fontPath: z.string().optional(),
  fontFamily: z.string().optional(),
  instagramIconPath: z.string().optional(),
  showLogo: z.boolean().default(true),
  showHandle: z.boolean().default(true),
  showPageIndicator: z.boolean().default(true),
  showSwipeArrow: z.boolean().default(true),
  colors: BrandColorsSchema.optional(),
  accentPalette: z.array(z.string()).optional(),
});

export const CarouselSchema = z.object({
  preferCarousel: z.boolean().default(true),
  frequency: z.number().min(0).max(1).default(0.4),
  maxSlides: z.number().min(2).max(10).default(10),
  minSlides: z.number().min(2).max(10).default(2),
});

export const ImageGenerationSchema = z.object({
  enabled: z.boolean(),
  // Currently only "carephoto" is wired up. Other providers can be added later
  // by branching in src/tools/generate-image.ts on this field.
  provider: z.literal("carephoto").default("carephoto"),
  defaultModel: z
    .enum([
      "nano-banana-2",
      "nano-banana-pro",
      "flux-lora",
      "recraft",
      "seedream-v5-lite",
      "qwen-image-2-pro",
      "gpt-image-2",
    ])
    .default("nano-banana-2"),
  defaultAspectRatio: z.enum(["1:1", "4:5", "9:16"]).default("4:5"),
});

export const HotTopicsSchema = z.object({
  // Free-form description of what topics count as "high relevance" for this
  // brand. Injected into the trending-topics clustering prompt so Haiku can
  // score topics against the brand's actual domain instead of a hard-coded one.
  relevantThemes: z.string(),
  // Optional override of the sources filename. Defaults to hot-topics-sources.json
  // inside the brand's directory.
  sourcesFile: z.string().default("hot-topics-sources.json"),
});

export const PostingScheduleSchema = z.object({
  coreDays: z.array(z.enum(WEEKDAYS as unknown as [Weekday, ...Weekday[]])).min(1).default(["mon", "tue", "wed", "thu", "fri"]),
  defaultTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("10:00"),
});

export const BrandFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string(),
  niche: z.string(),
  description: z.string(),
  competitors: z.array(CompetitorSchema),
  keywords: z.array(z.string()),
  tone: z.string(),
  postingSchedule: PostingScheduleSchema.default({}),
  promptBankPath: z.string().optional(),
  instagramHandle: z.string().optional(),
  designSystem: z.string().optional(),
  branding: BrandingSchema.optional(),
  carousel: CarouselSchema.optional(),
  hotTopics: HotTopicsSchema.optional(),
  imageGeneration: ImageGenerationSchema.optional(),
  // Seed-only fields (ignored by the agent):
  timezone: z.string().default("Europe/Brussels"),
  approvalMode: z.enum(["review", "autopilot"]).default("review"),
  publisher: z.enum(["postiz"]).nullable().default(null),
});
export type BrandFile = z.infer<typeof BrandFileSchema>;

export type BrandConfig = BrandFile & {
  brandDir: string;
  dbId: string;
  slug: string;
  productPhotos: { path: string; label: string }[];
};

export function assetLocalPath(a: Pick<AssetRow, "kind" | "storage_path">): string {
  const file = path.posix.basename(a.storage_path);
  return a.kind === "product" ? `assets/products/${file}` : `assets/${file}`;
}

const orUndef = <T>(v: T | null) => (v === null ? undefined : v);

export function brandConfigFromRow(row: BrandRow, assets: AssetRow[], brandDir: string): BrandConfig {
  const file = BrandFileSchema.parse({
    id: row.slug, name: row.name, domain: row.domain, niche: row.niche, description: row.description,
    competitors: row.competitors, keywords: row.keywords, tone: row.tone, postingSchedule: row.posting_schedule ?? {},
    promptBankPath: orUndef(row.prompt_bank_path), instagramHandle: orUndef(row.instagram_handle),
    designSystem: orUndef(row.design_system), branding: orUndef(row.branding), carousel: orUndef(row.carousel),
    hotTopics: orUndef(row.hot_topics), imageGeneration: orUndef(row.image_generation),
    timezone: row.timezone, approvalMode: row.approval_mode, publisher: row.publisher,
  });
  return {
    ...file,
    brandDir,
    dbId: row.id,
    slug: row.slug,
    productPhotos: assets
      .filter((a) => a.kind === "product")
      .map((a) => ({ path: assetLocalPath(a), label: a.label ?? path.posix.basename(a.storage_path) })),
  };
}
