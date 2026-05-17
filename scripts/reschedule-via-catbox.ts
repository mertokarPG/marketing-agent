import "dotenv/config";
import fs from "fs";
import path from "path";
import { schedulePost } from "../src/tools/schedule-post.js";
import { createDatabase } from "../src/db/schema.js";
import { insertPost } from "../src/db/queries.js";

// Meta is currently rejecting fetches from postiz.mertokar.com (but accepts the
// same bytes from catbox.moe). One-off escape hatch: upload the already-rendered
// slides to catbox and hand the public URLs to Postiz, which will pass them
// through to Meta unchanged.

const SLIDES = [
  "tmp/react-slides/claude-intro-19e7ed58-c1af-440f-920d-820c1bbc36d3-logo.png",
  "tmp/react-slides/b2a0ed67-7aa6-4e68-8ea8-6605d5bdf51c.png",
  "tmp/react-slides/4fa07b36-b81c-4cac-840d-c50026ab87ee.png",
  "tmp/react-slides/e1963a56-0206-47ed-b980-6adc01e649c9.png",
  "tmp/react-slides/1bf1de13-db99-43eb-901a-15566b2bdcfc.png",
  "tmp/react-slides/793fe775-7f72-41f0-8ef0-ed0f3bd517b8.png",
  "tmp/react-slides/c9841ff8-c4b3-433e-9a2d-20cbcd058e42.png",
  "tmp/react-slides/1350b8c3-4115-4523-a690-488eefc0e487.png",
  "tmp/react-slides/4a3fb734-0e2f-4422-bcc3-5d2399a9d09f.png",
  "tmp/react-slides/596d25b5-7041-4f99-a275-36e4d1fad255.png",
];

const CAPTION = `Claude Design is in the spotlight right now — and it's how we built our own carousel templates.

Swipe through 5 of the systems we ship with: Atelier, Nocturne, Bauhaus, Couture, Terminal. Each one is shown in its bare typographic form, then applied to a real carephoto post.

Every layout pairs with a photo from our library of 260+ AI-photo prompts at carephoto.art/prompt-bank.

Which aesthetic fits your feed?`;

const HASHTAGS = [
  "#claudedesign",
  "#designsystems",
  "#generativedesign",
  "#aitools",
  "#editorialdesign",
];

async function uploadToCatbox(filePath: string): Promise<string> {
  const bytes = fs.readFileSync(filePath);
  const blob = new Blob([new Uint8Array(bytes)], { type: "image/png" });
  const form = new FormData();
  form.append("reqtype", "fileupload");
  form.append("fileToUpload", blob, path.basename(filePath));
  const res = await fetch("https://catbox.moe/user/api.php", {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`catbox ${res.status}: ${await res.text()}`);
  const url = (await res.text()).trim();
  if (!url.startsWith("http")) throw new Error(`catbox bad response: ${url}`);
  return url;
}

async function main() {
  const absPaths = SLIDES.map((p) => path.resolve(p));
  for (const p of absPaths) {
    if (!fs.existsSync(p)) throw new Error(`Missing slide file: ${p}`);
  }

  console.log(`[catbox] Uploading ${absPaths.length} slides…`);
  const publicUrls: string[] = [];
  for (let i = 0; i < absPaths.length; i++) {
    const t0 = Date.now();
    const u = await uploadToCatbox(absPaths[i]);
    console.log(`  [${i + 1}/${absPaths.length}] ${u}  (${Date.now() - t0}ms)`);
    publicUrls.push(u);
  }

  // Schedule at 17:30 local Istanbul. schedule-post.ts will clamp if in past.
  const sched = new Date();
  sched.setHours(17, 30, 0, 0);
  const scheduledTime = sched.toISOString();

  console.log(`\n[postiz] Scheduling at ${scheduledTime}…`);
  const result = await schedulePost({
    caption: CAPTION,
    hashtags: HASHTAGS,
    images: publicUrls,
    scheduledTime,
  });
  console.log(`[postiz] ${result.ok ? "✓" : "✗"} ${result.message}`);

  if (result.ok) {
    const db = createDatabase(path.resolve("marketing-agent.db"));
    try {
      insertPost(db, {
        brand_id: "carephoto",
        caption: CAPTION,
        hashtags: HASHTAGS,
        image_url: publicUrls[0],
        content_theme: "claude-design-showcase",
        posted_at: scheduledTime,
        external_post_id: result.postizId,
        source_images: [],
      });
      console.log("[db] recorded.");
    } finally {
      db.close();
    }
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
