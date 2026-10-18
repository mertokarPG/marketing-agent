import Link from "next/link";
import { getTheme } from "@/lib/theme";
import { ThemeToggle } from "@/components/theme-toggle";
import { NavTabs } from "@/components/nav-tabs";
import { BrandSwitcher } from "@/components/brand-switcher";

type B = { slug: string; name: string };

/** Top bar. Without a brand (login, brand list) it is just the wordmark and theme toggle. */
export async function Nav({ brand, brands = [] }: { brand?: B; brands?: B[] }) {
  const theme = await getTheme();
  return (
    <>
      <header className="nav">
        <Link href="/" className="logo wide"><b>CARE</b><span>POST</span></Link>
        {brand ? <NavTabs slug={brand.slug} variant="top" /> : null}
        <div className="nav-end">
          {brand ? <BrandSwitcher current={brand} brands={brands.length ? brands : [brand]} /> : null}
          <ThemeToggle initial={theme} />
        </div>
      </header>
      {brand ? <NavTabs slug={brand.slug} variant="bottom" /> : null}
    </>
  );
}
