import { z } from "zod";
import fs from "fs";
import path from "path";

const CompetitorSchema = z.object({
  name: z.string(),
  instagram: z.string().optional(),
  website: z.string().optional(),
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
  instagram: z.object({
    accountId: z.string(),
    accessToken: z.string(),
  }),
  postingSchedule: z.object({
    frequency: z.enum(["daily", "weekdays", "custom"]),
    preferredTime: z.string(),
  }),
});

export type BrandConfig = z.infer<typeof BrandConfigSchema>;

export function loadBrand(brandId: string, brandsDir: string): BrandConfig {
  const filePath = path.join(brandsDir, `${brandId}.json`);
  const raw = fs.readFileSync(filePath, "utf-8");
  const json = JSON.parse(raw);
  return BrandConfigSchema.parse(json);
}
