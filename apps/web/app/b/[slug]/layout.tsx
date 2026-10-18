import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { loadBrand } from "./brand-context";

export const dynamic = "force-dynamic";

export default async function BrandLayout({ children, modal, params }: { children: ReactNode; modal: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const brand = await loadBrand(slug);
  const supabase = await createClient();
  const { data: brands, error } = await supabase.from("brands").select("slug, name").order("name");
  if (error) throw new Error(`brands query failed: ${error.message}`);
  return (
    <>
      <Nav brand={{ slug: brand.slug, name: brand.name }} brands={brands ?? []} />
      <main>{children}</main>
      {modal}
      <Footer />
    </>
  );
}
