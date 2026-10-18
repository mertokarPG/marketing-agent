import { cache } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canEdit, type Role } from "@/lib/brand-context";

export { canEdit };
export type { Role };

export type BrandView = {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  approval_mode: string;
  status: string;
  publisher: string | null;
  instagram_handle: string | null;
  role: Role;
  logoUrl: string | null;
};

export const loadBrand = cache(async (slug: string): Promise<BrandView> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();
  const { data: brand, error } = await supabase.from("brands")
    .select("id, slug, name, timezone, approval_mode, status, publisher, instagram_handle")
    .eq("slug", slug).maybeSingle();
  if (error) throw new Error(`brand query failed: ${error.message}`);
  if (!brand) notFound();
  const { data: member, error: mErr } = await supabase.from("brand_members")
    .select("role").eq("brand_id", brand.id).eq("user_id", user.id).maybeSingle();
  if (mErr) throw new Error(`membership query failed: ${mErr.message}`);
  if (!member) notFound();

  let logoUrl: string | null = null;
  const { data: logo } = await supabase.from("brand_assets")
    .select("storage_path").eq("brand_id", brand.id).eq("kind", "logo").limit(1).maybeSingle();
  if (logo?.storage_path) {
    const { data: signed } = await supabase.storage.from("brand-assets").createSignedUrl(logo.storage_path, 3600);
    logoUrl = signed?.signedUrl ?? null;
  }
  return { ...brand, role: member.role as Role, logoUrl };
});
