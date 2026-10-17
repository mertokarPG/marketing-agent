import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPlanned, statusLabel } from "@/lib/format";

export default async function BrandPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: brand, error: brandErr } = await supabase.from("brands").select("id, name, timezone").eq("slug", slug).maybeSingle();
  if (brandErr) throw new Error(`brand query failed: ${brandErr.message}`);
  if (!brand) notFound();
  const { data: posts, error: postsErr } = await supabase.from("posts")
    .select("id, kind, status, planned_at, caption, media").eq("brand_id", brand.id)
    .order("planned_at", { ascending: false }).limit(100);
  if (postsErr) throw new Error(`posts query failed: ${postsErr.message}`);
  const firstPath = (p: { media: unknown }) => (p.media as { storage_path: string }[] | null)?.[0]?.storage_path;
  const firstPaths = (posts ?? []).map(firstPath).filter(Boolean) as string[];
  const { data: signed } = firstPaths.length
    ? await supabase.storage.from("post-media").createSignedUrls(firstPaths, 600)
    : { data: [] as { path: string | null; signedUrl: string }[] };
  const thumb = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return (
    <main>
      <h1>{brand.name}</h1>
      <table cellPadding={6}>
        <thead><tr><th></th><th>When</th><th>Type</th><th>Status</th><th>Caption</th></tr></thead>
        <tbody>
          {(posts ?? []).map((p) => {
            const path = firstPath(p);
            const src = path ? thumb.get(path) : undefined;
            return (
              <tr key={p.id}>
                <td>{src ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={src} alt="" width={64} height={80} style={{ objectFit: "cover" }} /> : null}</td>
                <td>{formatPlanned(p.planned_at, brand.timezone)}</td>
                <td>{p.kind === "timely" ? "Timely" : "Planned"}</td>
                <td>{statusLabel(p.status)}</td>
                <td>{p.caption.split("\n")[0].slice(0, 120)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
