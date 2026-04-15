import { z } from "zod";
import fs from "fs";
import path from "path";

const CompetitorSchema = z.object({
  name: z.string(),
  instagram: z.string().optional(),
  website: z.string().optional(),
});

const BrandingSchema = z.object({
  enabled: z.boolean(),
  logoPath: z.string(),
  showLogo: z.boolean().default(true),
  showHandle: z.boolean().default(true),
  showPageIndicator: z.boolean().default(true),
  showSwipeArrow: z.boolean().default(true),
});

const CarouselSchema = z.object({
  preferCarousel: z.boolean().default(true),
  frequency: z.number().min(0).max(1).default(0.4),
  maxSlides: z.number().min(2).max(10).default(10),
  minSlides: z.number().min(2).max(10).default(2),
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
  branding: BrandingSchema.optional(),
  carousel: CarouselSchema.optional(),
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
