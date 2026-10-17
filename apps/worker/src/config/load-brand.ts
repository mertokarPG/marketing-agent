import fs from "fs";
import path from "path";
import { BrandFileSchema, type BrandFile } from "@carepost/core";
export type { BrandConfig } from "@carepost/core";

export type BrandFileWithDir = BrandFile & { brandDir: string };

export function loadBrand(brandId: string, brandsDir: string): BrandFileWithDir {
  const brandDir = path.join(brandsDir, brandId);
  const raw = fs.readFileSync(path.join(brandDir, "brand.json"), "utf-8");
  return { ...BrandFileSchema.parse(JSON.parse(raw)), brandDir };
}

export function brandSourcesPath(brand: BrandFileWithDir): string {
  const file = brand.hotTopics?.sourcesFile ?? "hot-topics-sources.json";
  return path.isAbsolute(file) ? file : path.join(brand.brandDir, file);
}
