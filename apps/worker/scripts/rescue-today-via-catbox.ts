import "dotenv/config";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { schedulePost } from "../src/tools/schedule-post.js";

const execFileAsync = promisify(execFile);

// One-off rescue: 2026-04-28 18:00 UTC carousel errored with Meta 2207052
// (host-rep cooldown on postiz.mertokar.com). Pull the already-uploaded JPGs
// out of the Postiz container, drop the failed post, and re-schedule via
// schedulePost() — the 72h cooldown check will see this fresh 2207052 and
// route the upload through catbox.

interface QueuedPost {
  postizId: string;
  caption: string;
  hashtags: string[];
  uploadFiles: string[];
  scheduledTime: string;
}

const TODAY = "2026/04/28";

const POSTS: QueuedPost[] = [
  {
    postizId: "cmoivgowt0000rw79zkm6rz98",
    caption:
      `Google just refreshed every Workspace icon. The reaction? Immediate. Emotional. Loud.\n\n` +
      `That visceral response people have to visual identity isn't pickiness — it's proof that aesthetics communicate something words can't.\n\n` +
      `Logos, icons, profile photos: the visual choices you make signal who you are before anyone reads a single word. People form impressions in milliseconds, and the feeling they get from your aesthetic is real, whether you designed it intentionally or not.\n\n` +
      `These images were created from prompts in our collection of 260+ AI photo prompts at carephoto.art/prompt-bank — each built with a specific visual identity in mind.\n\n` +
      `What's yours saying?`,
    hashtags: [
      "#VisualIdentity",
      "#PersonalBranding",
      "#AIPhotography",
      "#GoogleRebrand",
    ],
    uploadFiles: [
      "35ab775beb36cfbf94efb3d9efa44572.jpg",
      "2cbc9fbf7718f5e16d02dfe52bad6ed3.jpg",
      "8c26821810bb7a5d8673236eed3cfc585.jpg",
      "ea8cc42c617c74bd90779d808befa39d.jpg",
      "704fc83c8dbf19cbc0356f03f1cab856.jpg",
    ],
    scheduledTime: "2026-04-28T21:30:00Z",
  },
];

async function postizDelete(id: string): Promise<void> {
  const apiKey = process.env.POSTIZ_API_KEY!;
  const baseUrl =
    process.env.POSTIZ_BASE_URL ?? "https://app.postiz.com/api/public/v1";
  const res = await fetch(`${baseUrl}/posts/${id}`, {
    method: "DELETE",
    headers: { Authorization: apiKey },
  });
  if (!res.ok) throw new Error(`postiz delete ${res.status}: ${await res.text()}`);
}

async function pullFromContainer(filename: string): Promise<string> {
  const localPath = path.resolve("tmp/rescue", filename);
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  await execFileAsync("docker", [
    "cp",
    `postiz:/uploads/${TODAY}/${filename}`,
    localPath,
  ]);
  return localPath;
}

async function main() {
  for (const post of POSTS) {
    console.log(`\n=== ${post.postizId} → ${post.scheduledTime} ===`);

    console.log(`  pulling ${post.uploadFiles.length} image(s) from container…`);
    const localPaths: string[] = [];
    for (const f of post.uploadFiles) {
      const p = await pullFromContainer(f);
      localPaths.push(p);
    }

    console.log(`  deleting old Postiz post ${post.postizId}…`);
    await postizDelete(post.postizId);

    console.log(`  rescheduling via schedulePost() (catbox routing expected)…`);
    const result = await schedulePost({
      caption: post.caption,
      hashtags: post.hashtags,
      images: localPaths,
      scheduledTime: post.scheduledTime,
    });
    console.log(`  ${result.ok ? "✓" : "✗"} ${result.message}`);
    if (!result.ok) throw new Error(`reschedule failed for ${post.postizId}`);
  }

  console.log("\nRescue complete.");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
