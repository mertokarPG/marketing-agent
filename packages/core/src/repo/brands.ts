import type { Db } from "../db.js";

export interface BrandRow {
  id: string; slug: string; name: string; domain: string; niche: string; description: string; tone: string;
  keywords: string[]; competitors: unknown; instagram_handle: string | null; design_system: string | null;
  prompt_bank_path: string | null; branding: unknown; carousel: unknown; hot_topics: unknown; image_generation: unknown;
  posting_schedule: unknown; timezone: string; approval_mode: "review" | "autopilot"; status: "active" | "paused";
  publisher: "postiz" | null; created_at: Date;
}
export interface AssetRow {
  id: string; brand_id: string; kind: "logo" | "font" | "icon" | "product"; storage_path: string; label: string | null; metadata: unknown;
}

export async function getBrandById(db: Db, id: string): Promise<BrandRow | null> {
  return (await db.query<BrandRow>("select * from brands where id = $1", [id]))[0] ?? null;
}
export async function getBrandBySlug(db: Db, slug: string): Promise<BrandRow | null> {
  return (await db.query<BrandRow>("select * from brands where slug = $1", [slug]))[0] ?? null;
}
export async function listActiveBrands(db: Db): Promise<BrandRow[]> {
  return db.query<BrandRow>("select * from brands where status = 'active' order by created_at");
}
export async function listBrandAssets(db: Db, brandId: string): Promise<AssetRow[]> {
  return db.query<AssetRow>("select * from brand_assets where brand_id = $1 order by kind, created_at", [brandId]);
}
export async function listBrandSources(db: Db, brandId: string): Promise<Record<string, unknown>[]> {
  const rows = await db.query<{ source: Record<string, unknown> }>("select source from brand_sources where brand_id = $1", [brandId]);
  return rows.map((r) => r.source);
}
export async function getBrandNotifyEmails(db: Db, brandId: string): Promise<string[]> {
  const rows = await db.query<{ email: string }>(
    `select u.email from brand_members m join auth.users u on u.id = m.user_id
     where m.brand_id = $1 and u.email is not null order by u.email`, [brandId]);
  return rows.map((r) => r.email);
}
