import "dotenv/config";
import fs from "node:fs";
import { BUCKETS, createPostgresDb, createSupabaseStorage } from "@carepost/core";
import { contentTypeOf, extOf, planLegacyAttachments } from "./lib/attach-legacy-images.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const slug = args.find((a) => !a.startsWith("--"));
if (!slug) { console.error("Usage: npm run attach-legacy-images -- <brand-slug> [--dry-run]"); process.exit(1); }

const db = createPostgresDb(process.env.DATABASE_URL!);
const [brand] = await db.query<{ id: string }>("select id from brands where slug = $1", [slug]);
if (!brand) { console.error(`No brand ${slug}`); process.exit(1); }
const rows = await db.query<{ id: string; notes: string | null; media: unknown[] }>(
  "select id, notes, media from posts where brand_id = $1 and import_ref is not null and media = '[]'::jsonb", [brand.id]);
const plan = planLegacyAttachments(rows, (p) => fs.existsSync(p));
console.log(`${plan.length} planned uploads (of ${rows.length} imported posts without media)`);

if (dryRun) {
  for (const p of plan) console.log(`[dry-run] ${p.postId} <- ${p.file}`);
} else {
  const storage = createSupabaseStorage(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  for (const p of plan) {
    const storagePath = `${brand.id}/${p.postId}/0.${extOf(p.file)}`;
    await storage.upload(BUCKETS.media, storagePath, fs.readFileSync(p.file), contentTypeOf(p.file));
    await db.query("update posts set media = $2::jsonb where id = $1 and media = '[]'::jsonb", [p.postId, JSON.stringify([{ storage_path: storagePath }])]);
    console.log(`attached ${p.postId} -> ${storagePath}`);
  }
}
await db.end();
