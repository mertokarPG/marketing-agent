import { loadBrand } from "./brand-context";

// Placeholder: the Home page is built in Task 6.
export default async function BrandHome({ params }: { params: Promise<{ slug: string }> }) {
  const brand = await loadBrand((await params).slug);
  return <h1 className="wide hero">{brand.name} <b>home.</b></h1>;
}
