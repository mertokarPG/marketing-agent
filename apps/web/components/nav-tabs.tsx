"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "Home", path: "" },
  { label: "Calendar", path: "/calendar" },
  { label: "Brand", path: "/brand" },
  { label: "Results", path: "/results" },
] as const;

export function NavTabs({ slug, variant }: { slug: string; variant: "top" | "bottom" }) {
  const pathname = usePathname();
  const base = `/b/${slug}`;
  return (
    <nav className={variant === "top" ? "nav-links" : "tabbar"} aria-label={variant === "top" ? "Primary" : "Primary (mobile)"}>
      {TABS.map((t) => {
        const href = base + t.path;
        const on = t.path === "" ? pathname === base : pathname === href || pathname.startsWith(href + "/");
        return <Link key={t.label} href={href} className={on ? "on" : undefined} aria-current={on ? "page" : undefined}>{t.label}</Link>;
      })}
    </nav>
  );
}
