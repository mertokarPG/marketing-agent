/** Returns `next` only if it resolves to a same-origin relative target; otherwise "/". */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/")) return "/";
  if (/[\x00-\x20\x7F\\]/.test(next)) return "/";
  const base = new URL("http://localhost");
  try {
    const u = new URL(next, base);
    if (u.origin !== base.origin) return "/";
    return u.pathname + u.search + u.hash;
  } catch {
    return "/";
  }
}
