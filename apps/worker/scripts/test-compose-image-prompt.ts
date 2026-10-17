import "dotenv/config";
import path from "path";
import { loadBrand } from "../src/config/load-brand.js";
import { composeImagePrompt, type ComposeImagePromptInput } from "../src/tools/compose-image-prompt.js";

const CASES: Array<{
  label: string;
  expectedModel: string;
  input: ComposeImagePromptInput;
}> = [
  {
    label: "Editorial reaction post (SFW)",
    expectedModel: "gpt-image-2 (best polish, SFW-safe)",
    input: {
      postContext:
        "Reaction post to ComfyUI raising $30M at a $500M valuation. Carephoto's angle: we already give you all 7 top image-gen models in one subscription, no node graphs required.",
      visualStyle: "editorial",
      mustInclude: ["multiple monitors showing AI imagery", "creator workspace"],
      aspectRatio: "4:5",
    },
  },
  {
    label: "UGC selfie / lifestyle",
    expectedModel: "nano-banana-2 (relatable phone-cam aesthetic)",
    input: {
      postContext:
        "Casual UGC post showing a creator using carephoto on her phone in a coffee shop, demonstrating how easy it is to generate brand-on-style photos in 30 seconds while having coffee.",
      visualStyle: "ugc",
      mustInclude: null,
      aspectRatio: "9:16",
    },
  },
  {
    label: "Product shot with legible brand text",
    expectedModel: "gpt-image-2 or recraft (clean + legible text)",
    input: {
      postContext:
        "Product post unveiling carephoto's new 'Studio' tier subscription. Visual is the carephoto.art logo on a tactile premium surface (stamped foil, embossed paper, or similar) with the words 'STUDIO TIER' clearly readable.",
      visualStyle: "product",
      mustInclude: ["carephoto.art wordmark", "STUDIO TIER text legible"],
      aspectRatio: "1:1",
    },
  },
  {
    label: "Typography-heavy poster",
    expectedModel: "qwen-image-2-pro (typography aesthetic)",
    input: {
      postContext:
        "Provocative poster-style declaration: 'Photography is dead. Long live photography.' Designed to look like a 1970s Swiss-style design poster announcing a creative manifesto. Bold typography is the hero.",
      visualStyle: "hero",
      mustInclude: ["large bold typography", "swiss-poster aesthetic"],
      aspectRatio: "4:5",
    },
  },
  {
    label: "Premium photoreal hero portrait",
    expectedModel: "gpt-image-2 or nano-banana-pro (money shot)",
    input: {
      postContext:
        "Hero portrait launching carephoto's celebrity-photographer collaboration series. The image needs to look genuinely shot by a top fashion photographer — magazine-cover quality, no AI tells.",
      visualStyle: "hero",
      mustInclude: null,
      aspectRatio: "4:5",
    },
  },
  {
    label: "Behind-the-scenes workspace",
    expectedModel: "nano-banana-2 or seedream-v5-lite (workspace candor)",
    input: {
      postContext:
        "Behind-the-scenes post showing the carephoto team's office during a model-launch sprint — multiple screens with prompt experiments, post-it notes, takeout containers, late-night vibe but productive.",
      visualStyle: "bts",
      mustInclude: ["multiple monitors with image grids", "post-it notes on wall"],
      aspectRatio: "4:5",
    },
  },
];

async function main() {
  const brandId = process.env.BRAND ?? "carephoto";
  const brand = loadBrand(brandId, path.resolve("brands"));
  console.log(`Running ${CASES.length} composer test cases…`);
  console.log(`Prompt-bank path: ${brand.promptBankPath ?? "(none — composer will run without exemplars)"}\n`);

  for (const c of CASES) {
    console.log("══════════════════════════════════════════════════════");
    console.log(`CASE: ${c.label}`);
    console.log(`Expected model class: ${c.expectedModel}`);
    console.log(`Input visualStyle: ${c.input.visualStyle}`);
    console.log(`Input postContext: ${c.input.postContext.slice(0, 140)}…`);
    console.log("──────────────────────────────────────────────────────");
    const t0 = Date.now();
    try {
      const out = await composeImagePrompt(c.input, brand.promptBankPath);
      console.log(`recommendedModel: ${out.recommendedModel}`);
      console.log(`rationale:        ${out.rationale}`);
      console.log(`prompt:           ${out.prompt}`);
      console.log(`(took ${Date.now() - t0}ms)`);
    } catch (err) {
      console.log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    }
    console.log("");
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
