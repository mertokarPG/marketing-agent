export type Role = "owner" | "editor" | "viewer";

export function canEdit(role: Role): boolean {
  return role === "owner" || role === "editor";
}

/** Brand switcher target: keeps the current top-level tab, drops anything deeper. */
export function switchHref(currentPath: string, toSlug: string): string {
  const m = /^\/b\/[^/]+(?:\/([^/]+))?\/?$/.exec(currentPath);
  const tab = m?.[1];
  return tab ? `/b/${toSlug}/${tab}` : `/b/${toSlug}`;
}

/** The token-hash confirm route is a local dev/screenshot aid only: never in production, magiclink only. */
export function confirmAllowed(nodeEnv: string | undefined, type: string | null): boolean {
  return nodeEnv !== "production" && type === "magiclink";
}
