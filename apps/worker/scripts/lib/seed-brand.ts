import fs from "node:fs";
import path from "node:path";
import { BUCKETS, type Db, type StorageClient } from "@carepost/core";
import { loadBrand, brandSourcesPath } from "../../src/config/load-brand.js";
import { loadSourcesConfig } from "../../src/tools/scrape-hot-topics.js";

const TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".otf": "font/otf" };
const typeOf = (f: string) => TYPES[path.extname(f).toLowerCase()] ?? "application/octet-stream";

export async function seedBrandFromDir(deps: { db: Db; storage: StorageClient }, brandDir: string, ownerEmail: string): Promise<string> {
  const { db, storage } = deps;
  const file = loadBrand(path.basename(brandDir), path.dirname(brandDir));
  const [owner] = await db.query<{ id: string }>("select id from auth.users where lower(email) = lower($1)", [ownerEmail]);
  if (!owner) throw new Error(`No user ${ownerEmail}. Sign in to the web app once with that email, then re-run.`);

  const branding = file.branding ? { ...file.branding } : null;
  const assetFiles: { kind: "logo" | "font" | "icon" | "product"; src: string; label: string | null }[] = [];
  if (branding) {
    const fields = [["logoPath", "logo"], ["fontPath", "font"], ["instagramIconPath", "icon"]] as const;
    for (const [field, kind] of fields) {
      const rel = branding[field];
      if (!rel) continue;
      assetFiles.push({ kind, src: path.resolve(brandDir, rel), label: null });
      (branding as any)[field] = `assets/${path.basename(rel)}`;
    }
  }
  const productsDir = path.join(brandDir, "assets/products");
  if (fs.existsSync(productsDir)) {
    for (const f of fs.readdirSync(productsDir).filter((f) => typeOf(f).startsWith("image/")).sort()) {
      assetFiles.push({ kind: "product", src: path.join(productsDir, f), label: path.parse(f).name.replace(/[-_]+/g, " ") });
    }
  }

  const [brand] = await db.query<{ id: string }>(
    `insert into brands (slug, name, domain, niche, description, tone, keywords, competitors, instagram_handle, design_system,
       prompt_bank_path, branding, carousel, hot_topics, image_generation, posting_schedule, timezone, approval_mode, publisher)
     values ($1,$2,$3,$4,$5,$6,$7::text[],$8::jsonb,$9,$10,$11,$12::jsonb,$13::jsonb,$14::jsonb,$15::jsonb,$16::jsonb,$17,$18,$19)
     on conflict (slug) do update set name = excluded.name, domain = excluded.domain, niche = excluded.niche,
       description = excluded.description, tone = excluded.tone, keywords = excluded.keywords, competitors = excluded.competitors,
       instagram_handle = excluded.instagram_handle, design_system = excluded.design_system, prompt_bank_path = excluded.prompt_bank_path,
       branding = excluded.branding, carousel = excluded.carousel, hot_topics = excluded.hot_topics,
       image_generation = excluded.image_generation, posting_schedule = excluded.posting_schedule, timezone = excluded.timezone,
       approval_mode = excluded.approval_mode, publisher = excluded.publisher
     returning id`,
    [file.id, file.name, file.domain, file.niche, file.description, file.tone, file.keywords, JSON.stringify(file.competitors),
     file.instagramHandle ?? null, file.designSystem ?? null, file.promptBankPath ?? null, JSON.stringify(branding),
     JSON.stringify(file.carousel ?? null), JSON.stringify(file.hotTopics ?? null), JSON.stringify(file.imageGeneration ?? null),
     JSON.stringify(file.postingSchedule), file.timezone, file.approvalMode, file.publisher]);

  for (const a of assetFiles) {
    const storagePath = `${brand.id}/${a.kind}/${path.basename(a.src)}`;
    await storage.upload(BUCKETS.assets, storagePath, fs.readFileSync(a.src), typeOf(a.src));
    await db.query(
      `insert into brand_assets (brand_id, kind, storage_path, label) values ($1,$2,$3,$4)
       on conflict (storage_path) do update set label = excluded.label`, [brand.id, a.kind, storagePath, a.label]);
  }

  const sourcesFile = brandSourcesPath(file);
  if (fs.existsSync(sourcesFile)) {
    await db.query("delete from brand_sources where brand_id = $1", [brand.id]);
    for (const s of loadSourcesConfig(sourcesFile).sources) {
      await db.query("insert into brand_sources (brand_id, source) values ($1, $2::jsonb)", [brand.id, JSON.stringify(s)]);
    }
  }

  await db.query(
    "insert into brand_members (brand_id, user_id, role) values ($1, $2, 'owner') on conflict do nothing", [brand.id, owner.id]);
  return brand.id;
}
