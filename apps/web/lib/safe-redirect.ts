/** Returns `next` only if it resolves to a same-origin relative target; otherwise "/". */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/")) return "/";
  if (/[\x00-\x20\x7F\\]/.test(next)) return "/";
  const base = new URL("http://localhost");
  try {
    const u = new URL(next, base);
    if (u.origin !== base.origin) return "/";
    const result = u.pathname + u.search + u.hash;
    // Dot-segment collapsing can yield a protocol-relative result (e.g. "/..//evil.com"): re-validate the output.
    if (!result.startsWith("/") || result.startsWith("//") || result.startsWith("/\\")) return "/";
    if (new URL(result, base).origin !== base.origin) return "/";
    return result;
  } catch {
    return "/";
  }
}
