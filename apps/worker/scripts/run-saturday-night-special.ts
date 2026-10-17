import "dotenv/config";
import path from "path";
import { loadBrand } from "../src/config/load-brand.js";
import { createDatabase } from "../src/db/schema.js";
import { runAgent } from "../src/orchestrator.js";
import { detectTunnelUrl } from "../src/utils/detect-tunnel.js";

if (!process.env.POSTIZ_TUNNEL_URL) detectTunnelUrl();

async function main() {
  const brandsDir = path.resolve("brands");
  const brand = loadBrand("carephoto", brandsDir);
  const db = createDatabase(path.resolve("marketing-agent.db"));

  // Saturday night UTC window — Europe is ~9-11pm, US East 4-6pm.
  const earliest = new Date(Date.now() + 60 * 60 * 1000); // at least +1h
  const latest = new Date();
  latest.setUTCHours(22, 0, 0, 0); // by 10pm UTC

  const brief = [
    `SATURDAY NIGHT SPECIAL — additional post on top of today's 14:30 UTC carousel.`,
    `Today is ${new Date().toISOString().split("T")[0]}. The morning cycle already`,
    `shipped a 5-slide "Every Room Needs Its Own Photo" carousel. Don't repeat that`,
    `angle, don't re-do pillar audits, don't re-scrape — just ship one MORE post`,
    `for the Saturday night engagement window.`,
    ``,
    `BRIEF — "Saturday night, after dark":`,
    `The post is about magnetism. The kind of photo that someone screenshots and`,
    `sends to a friend. After-dark energy: low light, charged moments, a beat of`,
    `personality. carephoto's angle: this is what a photo studio for the version`,
    `of you that exists at 11pm looks like — not the LinkedIn you, not the dating-`,
    `app you, the YOU. Whatever fictional brand / persona / scenario gets us there.`,
    `Pick something with edge.`,
    ``,
    `HARD REQUIREMENTS:`,
    `1. SHIP AT MOST 1 carousel (3 slides MAX) or 1 single hero image. Saturday`,
    `   night is not a thinkpiece — it's one striking image with a sharp caption.`,
    `   Default to single hero unless you have a real reason to carousel.`,
    `2. Visual: MUST call compose_image_prompt FIRST, then pass its prompt +`,
    `   recommendedModel directly to generate_image. The composer was JUST upgraded`,
    `   today with the FIVE-LAYER discipline (wardrobe condition / hair-skin-makeup`,
    `   state / pose with both hands / setting triple / camera intent) AND the FIVE`,
    `   SCROLL-STOPPING dimensions (conceptual hook / one controlled imperfection /`,
    `   mixed light + underexposure / explicit gaze choice / cultural archetype +`,
    `   photographer reference). The point of this post is to show what the upgrade`,
    `   produces. Trust the composer.`,
    `3. Lean into the "spicy" — edgy, magnetic, after-dark, low-light, charged.`,
    `   This is NOT the time for a coffee-shop UGC. Reach for: late-night kitchen`,
    `   in a slip dress with one wine glass, fire-escape rooftop, dimly-lit bar`,
    `   booth, hotel-lobby with a martini, midnight subway with a leather jacket,`,
    `   3am bedroom with a cigarette by the open window. Pick ONE specific scene.`,
    `4. Branding: every generate_image output MUST go through brand_image OR`,
    `   photo_overlay before scheduling. Raw model output is not acceptable.`,
    `5. Schedule between ${earliest.toISOString()} and ${latest.toISOString()} (UTC).`,
    `6. Caption should match the energy: tight, confident, a little mysterious.`,
    `   No hashtag-stuffing — 3-5 max.`,
    `7. promptIds: empty array (this is a generated image, not prompt-bank).`,
    `8. Send a notification at the end summarizing:`,
    `     - chosen scene + concept hook`,
    `     - the EXACT prompt the composer produced (full text)`,
    `     - which model + why`,
    `     - branding tool used`,
    `     - scheduled time + Postiz post ID`,
    ``,
    `Be efficient. Don't over-research — pick a scene, compose, generate, brand,`,
    `ship. The whole run should be ~6 iterations max.`,
  ].join("\n");

  console.log("======================================================");
  console.log(`[saturday-night] brand: ${brand.name} (${brand.id})`);
  console.log(`[saturday-night] window: ${earliest.toISOString()} → ${latest.toISOString()}`);
  console.log("======================================================");

  try {
    await runAgent(brand, db, { userBrief: brief, maxIterations: 12 });
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error("[saturday-night] FATAL:", err);
  process.exit(1);
});
