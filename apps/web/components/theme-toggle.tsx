"use client";
import { useState } from "react";

export function ThemeToggle({ initial }: { initial: "dark" | "light" }) {
  const [theme, setTheme] = useState(initial);
  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.cookie = `cp-theme=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.dataset.theme = next;
    setTheme(next);
  }
  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}
