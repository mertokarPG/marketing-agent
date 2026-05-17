import { z } from "zod";
import fs from "fs";
import path from "path";

const CompetitorSchema = z.object({
  name: z.string(),
  instagram: z.string().optional(),
  website: z.string().optional(),
});

const BrandColorsSchema = z.object({
  primary: z.string().default("#6C3CE1"),
  secondary: z.string().default("#1a1a2e"),
  accent: z.string().default("#E14ECE"),
});

const BrandingSchema = z.object({
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

const CarouselSchema = z.object({
  preferCarousel: z.boolean().default(true),
  frequency: z.number().min(0).max(1).default(0.4),
  maxSlides: z.number().min(2).max(10).default(10),
  minSlides: z.number().min(2).max(10).default(2),
});

const ImageGenerationSchema = z.object({
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

const HotTopicsSchema = z.object({
  // Free-form description of what topics count as "high relevance" for this
  // brand. Injected into the trending-topics clustering prompt so Haiku can
  // score topics against the brand's actual domain instead of a hard-coded one.
  relevantThemes: z.string(),
  // Optional override of the sources filename. Defaults to hot-topics-sources.json
  // inside the brand's directory.
  sourcesFile: z.string().default("hot-topics-sources.json"),
});

const BrandConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string(),
  niche: z.string(),
  description: z.string(),
  competitors: z.array(CompetitorSchema),
  keywords: z.array(z.string()),
  tone: z.string(),
  postingSchedule: z.object({
    frequency: z.enum(["daily", "weekdays", "custom"]),
    preferredTime: z.string(),
  }),
  promptBankPath: z.string().optional(),
  instagramHandle: z.string().optional(),
  designSystem: z.string().optional(),
  branding: BrandingSchema.optional(),
  carousel: CarouselSchema.optional(),
  hotTopics: HotTopicsSchema.optional(),
  imageGeneration: ImageGenerationSchema.optional(),
});

type BrandConfigRaw = z.infer<typeof BrandConfigSchema>;

export type BrandConfig = BrandConfigRaw & {
  brandDir: string;
};

export function loadBrand(brandId: string, brandsDir: string): BrandConfig {
  const brandDir = path.join(brandsDir, brandId);
  const filePath = path.join(brandDir, "brand.json");

  if (!fs.existsSync(filePath)) {
    // Fallback: try legacy flat file (brands/brandId.json)
    const legacyPath = path.join(brandsDir, `${brandId}.json`);
    const raw = fs.readFileSync(legacyPath, "utf-8");
    const json = JSON.parse(raw);
    return { ...BrandConfigSchema.parse(json), brandDir: brandsDir };
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  const json = JSON.parse(raw);
  return { ...BrandConfigSchema.parse(json), brandDir };
}

// Resolve the absolute path to the brand's hot-topics sources config. Uses
// the optional override in brand.json → hotTopics.sourcesFile; falls back to
// `hot-topics-sources.json` in the brand directory.
export function brandSourcesPath(brand: BrandConfig): string {
  const file = brand.hotTopics?.sourcesFile ?? "hot-topics-sources.json";
  return path.isAbsolute(file) ? file : path.join(brand.brandDir, file);
}
