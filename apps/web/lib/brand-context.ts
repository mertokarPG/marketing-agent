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
