import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const { data: brands, error } = await supabase.from("brands").select("slug, name").order("name");
  if (error) throw new Error(`brands query failed: ${error.message}`);
  if (brands?.length === 1) redirect(`/b/${brands[0].slug}`);
  return (
    <>
      <Nav />
      <main>
        {!brands?.length ? (
          <p className="lede">You&apos;re not part of a brand yet. Ask the brand owner to invite you.</p>
        ) : (
          <>
            <h1 className="wide hero">Your <b>brands.</b></h1>
            <ul className="brand-list">
              {brands.map((b) => <li key={b.slug}><Link href={`/b/${b.slug}`} className="pill">{b.name} ↳</Link></li>)}
            </ul>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
