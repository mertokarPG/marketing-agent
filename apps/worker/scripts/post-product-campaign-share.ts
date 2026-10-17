import "dotenv/config";
import path from "path";
import Database from "better-sqlite3";
import { loadBrand } from "../src/config/load-brand.js";
import { schedulePost } from "../src/tools/schedule-post.js";
import {
  insertPost,
  insertContentCalendarEntry,
  updateContentCalendarStatus,
} from "../src/db/queries.js";

const SLIDE_DIR = path.resolve("tmp/prompt-share-product");
const IMAGES = [
  "01-cover.png",
  "02-classic-glass-coca-cola-bottle.png",
  "03-apple-iphone-16-pro-in-titanium.png",
  "04-nike-air-jordan-1-sneaker.png",
  "05-chanel-no-5-perfume-bottle.png",
  "06-heinz-ketchup-glass-bottle.png",
  "07-prompt-card.png",
].map((n) => path.join(SLIDE_DIR, n));

const CAPTION = `Free prompt — swipe to slide 7 for the full thing.

Same low-angle campaign shot, one [PRODUCT-PLACEHOLDER] you swap in for whatever you sell. Tested across Coca-Cola, iPhone 16 Pro, Air Jordan 1, Chanel No. 5 and Heinz — same composition, five very different products.

Rendered with Nano Banana 2. 260+ more prompts at carephoto.art/prompt-bank →`;

const HASHTAGS = [
  "aiphotography",
  "productphotography",
  "aiprompts",
  "commercialphoto",
  "carephoto",
];

// Sunday 19:30 UTC — pre-week aspirational slot per the energy map.
const SCHEDULED_TIME = "2026-05-17T19:30:00Z";

async function main() {
  const brand = loadBrand("carephoto", path.resolve("brands"));
  const db = new Database(path.resolve("marketing-agent.db"));

  const calendarId = insertContentCalendarEntry(db, {
    brand_id: brand.id,
    planned_date: new Date().toISOString().split("T")[0],
    theme: "prompt-share",
    caption_draft: CAPTION,
    hashtags: HASHTAGS,
    reasoning:
      "Custom Prompt Share post — low-angle product campaign template with [PRODUCT-PLACEHOLDER] rotation across 5 mainstream brands.",
  });

  console.log(`Scheduling 7-slide carousel for ${SCHEDULED_TIME}…`);
  const result = await schedulePost({
    caption: CAPTION,
    hashtags: HASHTAGS,
    images: IMAGES,
    scheduledTime: SCHEDULED_TIME,
  });

  console.log(`\nschedule_post result: ok=${result.ok}`);
  console.log(result.message);
  if (result.postizId) console.log(`Postiz post ID: ${result.postizId}`);

  if (result.ok) {
    insertPost(db, {
      brand_id: brand.id,
      caption: CAPTION,
      hashtags: HASHTAGS,
      image_url: IMAGES[0],
      content_theme: "prompt-share",
      posted_at: SCHEDULED_TIME,
      external_post_id: result.postizId,
      source_images: [],
    });
    updateContentCalendarStatus(db, calendarId, "posted");
    console.log(`✓ DB recorded.`);
  } else {
    updateContentCalendarStatus(db, calendarId, "planned");
    console.error(`✗ schedule_post did not return ok — left as planned in DB.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
