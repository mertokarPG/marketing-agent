"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { switchHref } from "@/lib/brand-context";

type B = { slug: string; name: string };

export function BrandSwitcher({ current, brands }: { current: B; brands: B[] }) {
  const pathname = usePathname();
  if (brands.length <= 1) return <span className="pill switcher">{current.name}</span>;
  return (
    <details className="switcher-menu">
      <summary className="pill switcher">{current.name} ▾</summary>
      <ul>
        {brands.map((b) => (
          <li key={b.slug}><Link href={switchHref(pathname, b.slug)} aria-current={b.slug === current.slug ? "true" : undefined}>{b.name}</Link></li>
        ))}
      </ul>
    </details>
  );
}
