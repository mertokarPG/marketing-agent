import { createClient } from "@/lib/supabase/server";
import { Ribbon } from "@/components/ribbon";
import { loadBrand } from "../brand-context";
import { postingDaysText, approvalText } from "./brand-text";

export default async function BrandPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const brand = await loadBrand(slug);
  const supabase = await createClient();
  const { data, error } = await supabase.from("brands").select("posting_schedule").eq("id", brand.id).maybeSingle();
  if (error) console.warn(`[brand] schedule query failed: ${error.message}`);

  const rows: [string, string][] = [
    ["Time zone", brand.timezone],
    ["Posting days", postingDaysText(data?.posting_schedule)],
    ["Approval", approvalText(brand.approval_mode)],
  ];
  return (
    <div className="page">
      <Ribbon />
      <h1 className="hero wide">Your <b>brand.</b></h1>
      <div className="brand-head">
        {brand.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logoUrl} alt={`${brand.name} logo`} className="brand-logo" />
        )}
        <h2 className="t wide brand-name">{brand.name}</h2>
      </div>
      <dl className="facts">
        {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      <p className="lede">Brand setup is coming soon.</p>
    </div>
  );
}
