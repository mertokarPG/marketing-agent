import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const { data: brands, error } = await supabase.from("brands").select("slug, name").order("name");
  if (error) throw new Error(`brands query failed: ${error.message}`);
  return (
    <main>
      <h1>Your brands</h1>
      {!brands?.length ? <p>You don&apos;t have access to any brand yet.</p> : (
        <ul>{brands.map((b) => <li key={b.slug}><Link href={`/brands/${b.slug}`}>{b.name}</Link></li>)}</ul>
      )}
    </main>
  );
}
