import "dotenv/config";
import path from "path";
import { loadBrand } from "../src/config/load-brand.js";
import { loadDesignSystem, isHtmlTokens } from "../src/config/load-design-system.js";
import { getBrandLogo } from "../src/tools/brand-logo.js";
import { renderCarouselCover } from "../src/tools/carousel-cover.js";

async function main() {
  const brand = loadBrand("carephoto", path.resolve("brands"));
  const ds = loadDesignSystem("editorial-paper", path.resolve("design-systems"));
  if (!isHtmlTokens(ds)) throw new Error("editorial-paper expected to be html-tokens");

  const logo = await getBrandLogo({
    brand: "openai.com",
    variant: "logo",
    theme: "light", // dark bg → light-colored logo
  });
  console.log(`[logo] ${logo.filePath}`);

  const out = await renderCarouselCover({
    templateId: "dark-hero-cover",
    slots: {
      kicker: "NEW IN THE STUDIO",
      headline: "ChatGPT Images 2.0 is live",
      accentWord: "live",
      subtitle: "Pick it alongside Flux, Seedream, Nano Banana, Imagen, and Qwen — every major model in one subscription at carephoto.art.",
      decorativeChar: null,
      stickerText: "added today",
    },
    background: "aurora",
    accentColor: null,
    pageNumber: 1,
    totalPages: 4,
    branding: brand.branding!,
    brandDir: brand.brandDir,
    designSystemDir: ds.rootDir,
    instagramHandle: brand.instagramHandle ?? "carephoto",
    brandLogoPath: logo.filePath,
  });

  console.log(`[cover] ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
