import "dotenv/config";
import path from "path";
import { composeImagePrompt } from "../src/tools/compose-image-prompt.js";
import { renderPhotoOverlay } from "../src/tools/photo-overlay.js";
import { schedulePost } from "../src/tools/schedule-post.js";
import { loadBrand } from "../src/config/load-brand.js";
import { loadDesignSystem } from "../src/config/load-design-system.js";
import { detectTunnelUrl } from "../src/utils/detect-tunnel.js";

if (!process.env.POSTIZ_TUNNEL_URL) detectTunnelUrl();

const POST_ID = "cmoydmwkf000frw79qs3ooca3";
const POST_DATE = "2026-05-09T14:30:00.000Z";

// Existing slide URLs from Postiz DB (in order). We keep 1, 2, 4, 5
// and only swap slide 3 (dating profile candid).
const SLIDE_1_COVER = "https://postiz.mertokar.com/uploads/2026/05/09/118d26c43718610dce624ea42198aa49c.jpg";
const SLIDE_2_LINKEDIN = "https://postiz.mertokar.com/uploads/2026/05/09/ed5932723a9d9a41c785adc1081d6d8510.jpg";
const SLIDE_4_PORTFOLIO = "https://postiz.mertokar.com/uploads/2026/05/09/14108adca4c1286101b8d4bccc81079f826.jpg";
const SLIDE_5_CTA = "https://postiz.mertokar.com/uploads/2026/05/09/22874383123f876eae3153c21056daae.jpg";

const FULL_CAPTION =
  `Three different rooms. Three completely different photos.\n\n` +
  `Your LinkedIn photo needs to signal competence before anyone reads your title. Your dating profile needs to feel like you before anything else does. Your creative portfolio needs to show taste, not just polish.\n\n` +
  `Most people use the same photo everywhere — same lighting, same angle, same expression — and wonder why it's not landing in every context.\n\n` +
  `Slide 2 is the LinkedIn brief: authority before you speak.\n` +
  `Slide 3 is the dating profile brief: warmth before words.\n` +
  `Slide 4 is the creative portfolio brief: perspective before your title.\n\n` +
  `Each one was built with a different intent. That's what separates a photo that works from one that just sits there.\n\n` +
  `One studio. Every version of you. carephoto.art`;

const HASHTAGS = [
  "#AIPhotography",
  "#LinkedInProfile",
  "#DatingProfile",
  "#AIHeadshots",
  "#PersonalBranding",
];

const POST_CONTEXT =
  `Carousel slide showcasing what carephoto produces for a DATING-PROFILE brief — the slide caption is "Warmth before anything else" with subtitle "The version of you that exists after 6pm — captured." The post's whole frame is "the version of you that exists at a specific time of day, in a specific room, around the people you'd actually be around" — magnetism + warmth + a beat of personality. The photo MUST be a dating-app portrait that would actually win on Hinge/Bumble — not a polite stock-photo coffee-shop smile. Push past safe: late-light intimate moment, named wardrobe with a point of view, a real micro-action, eye-contact-after-a-good-line. The previous attempt was a generic woman laughing in a beige sweater in a cafe — that exact shot is what we are NOT shooting. Pick something with chemistry.`;

async function postizDelete(id: string): Promise<void> {
  const apiKey = process.env.POSTIZ_API_KEY!;
  const baseUrl =
    process.env.POSTIZ_BASE_URL ?? "https://app.postiz.com/api/public/v1";
  const res = await fetch(`${baseUrl}/posts/${id}`, {
    method: "DELETE",
    headers: { Authorization: apiKey },
  });
  if (!res.ok) {
    throw new Error(`postiz delete ${res.status}: ${await res.text()}`);
  }
}

async function generateViaApi(prompt: string, model: string): Promise<string> {
  const apiKey = process.env.CAREPHOTO_API_KEY!;
  const baseUrl =
    process.env.CAREPHOTO_BASE_URL ?? "https://carephoto.art/api/v1/agent";
  const res = await fetch(`${baseUrl}/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ prompt, model, aspectRatio: "4:5" }),
  });
  if (!res.ok) {
    throw new Error(`carephoto generate ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    imageUrl: string;
    creditsUsed: number;
    estimatedUsdCost: number;
  };
  console.log(
    `  generated image: ${data.imageUrl} (${data.creditsUsed} credits, $${data.estimatedUsdCost.toFixed(3)})`
  );
  return data.imageUrl;
}

async function main() {
  const brandsDir = path.resolve("brands");
  const brand = loadBrand("carephoto", brandsDir);
  const designSystemsDir = path.resolve("design-systems");
  const designSystem = loadDesignSystem(brand.designSystem!, designSystemsDir);

  console.log("=== Compose ===");
  const composed = await composeImagePrompt(
    {
      postContext: POST_CONTEXT,
      visualStyle: "ugc",
      mustInclude: null,
      aspectRatio: "4:5",
    },
    brand.promptBankPath
  );
  console.log(`  model:     ${composed.recommendedModel}`);
  console.log(`  rationale: ${composed.rationale}`);
  console.log(`  prompt:\n    ${composed.prompt.replace(/\n/g, "\n    ")}`);

  console.log("\n=== Generate ===");
  const newImageUrl = await generateViaApi(composed.prompt, composed.recommendedModel);

  console.log("\n=== Render photo overlay ===");
  const overlayPath = await renderPhotoOverlay({
    templateId: "photo-caption-bar",
    photoSource: newImageUrl,
    slots: {
      kicker: "THE DATING PROFILE",
      headline: "Warmth before anything else",
      accentWord: "Warmth",
      subtitle: "The version of you that exists after 6pm — captured.",
    },
    accentColor: null,
    pageNumber: 3,
    totalPages: 5,
    branding: brand.branding!,
    brandDir: brand.brandDir,
    designSystemDir: designSystem.rootDir,
    instagramHandle: brand.instagramHandle ?? "",
  });
  console.log(`  overlay: ${overlayPath}`);

  console.log("\n=== Delete existing Postiz post ===");
  await postizDelete(POST_ID);
  console.log(`  deleted ${POST_ID}`);

  console.log("\n=== Reschedule with new slide 3 ===");
  const result = await schedulePost({
    caption: FULL_CAPTION,
    hashtags: HASHTAGS,
    images: [
      SLIDE_1_COVER,
      SLIDE_2_LINKEDIN,
      overlayPath,
      SLIDE_4_PORTFOLIO,
      SLIDE_5_CTA,
    ],
    scheduledTime: POST_DATE,
  });

  console.log(`  ${result.ok ? "✓" : "✗"} ${result.message}`);
  if (!result.ok) throw new Error("reschedule failed");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
