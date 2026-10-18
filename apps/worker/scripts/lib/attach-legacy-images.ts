import path from "node:path";

export const IMAGE_TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };
const PATH_RE = /^(\/.*?\.(?:png|jpe?g|webp|gif))(?=\s|$)/i;

/** The import stored the old image_url (a local absolute path) at the start of posts.notes. */
export function planLegacyAttachments(
  rows: { id: string; notes: string | null; media: unknown[] }[],
  exists: (p: string) => boolean,
): { postId: string; file: string }[] {
  const candidates: { postId: string; file: string }[] = [];
  for (const r of rows) {
    if (r.media.length > 0) continue;
    const m = r.notes?.trimStart().match(PATH_RE);
    if (m && exists(m[1])) candidates.push({ postId: r.id, file: m[1] });
  }
  const counts = new Map<string, number>();
  for (const c of candidates) counts.set(c.file, (counts.get(c.file) ?? 0) + 1);
  return candidates.filter((c) => counts.get(c.file) === 1);
}

export const extOf = (f: string) => path.extname(f).toLowerCase().replace(/^\./, "");
export const contentTypeOf = (f: string) => IMAGE_TYPES[path.extname(f).toLowerCase()] ?? "application/octet-stream";
