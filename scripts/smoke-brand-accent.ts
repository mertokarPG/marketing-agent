import path from "path";
import { loadDesignSystem, isReactJsx } from "../src/config/load-design-system.js";
import { renderReactSlide } from "../src/tools/react-slide.js";
import { loadBrand } from "../src/config/load-brand.js";

async function main() {
  const brand = loadBrand("carephoto", path.resolve("brands"));
  const ds = loadDesignSystem("atelier", path.resolve("design-systems"));
  if (!isReactJsx(ds)) throw new Error("expected react-jsx ds");

  const brandAccent = brand.branding?.colors?.accent ?? null;
  console.log(`Brand default accent: ${brandAccent}`);
  console.log(`Design-system default accent: ${ds.palettes.light.accent}`);

  const out = await renderReactSlide({
    designSystem: ds,
    slideKind: "cover",
    slide: {
      eyebrow: "Issue № 04",
      kicker: "A field guide",
      title: "Brand-accent override test",
      subtitle: "This should render with the carephoto brand accent, not atelier's default.",
      cta: "Swipe →",
    },
    handle: `@${brand.instagramHandle}`,
    year: String(new Date().getFullYear()),
    mode: "light",
    markVariant: "quad",
    pageNumber: 1,
    totalPages: 1,
    customAccent: brandAccent,
  });
  console.log("Wrote:", out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
