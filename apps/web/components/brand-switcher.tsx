"use client";
import Link from "next/link";
import { useRef } from "react";
import { usePathname } from "next/navigation";
import { switchHref } from "@/lib/brand-context";

type B = { slug: string; name: string };

export function BrandSwitcher({ current, brands }: { current: B; brands: B[] }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDetailsElement>(null);
  const close = () => ref.current?.removeAttribute("open");
  if (brands.length <= 1) return <span className="pill switcher">{current.name}</span>;
  return (
    <details ref={ref} className="switcher-menu" onKeyDown={(e) => { if (e.key === "Escape") close(); }}>
      <summary className="pill switcher">{current.name} ▾</summary>
      <ul>
        {brands.map((b) => (
          <li key={b.slug}><Link onClick={close} href={switchHref(pathname, b.slug)} aria-current={b.slug === current.slug ? "true" : undefined}>{b.name}</Link></li>
        ))}
      </ul>
    </details>
  );
}
