import path from "path";
import { loadDesignSystem, isReactJsx } from "../src/config/load-design-system.js";
import { renderReactSlide } from "../src/tools/react-slide.js";

async function main() {
  const ds = loadDesignSystem("atelier", path.resolve("design-systems"));
  if (!isReactJsx(ds)) throw new Error("expected react-jsx ds");

  const out = await renderReactSlide({
    designSystem: ds,
    slideKind: "cover",
    slide: {
      eyebrow: "Issue № 04",
      kicker: "A field guide",
      title: "The quiet ritual of pour-over coffee",
      subtitle: "Five things we learned roasting 200 lbs of single-origin beans in our garage.",
      cta: "Swipe →",
    },
    handle: "@carephoto.art",
    year: "2026",
    mode: "light",
    markVariant: "quad",
    pageNumber: 1,
    totalPages: 7,
  });

  console.log("Wrote:", out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
