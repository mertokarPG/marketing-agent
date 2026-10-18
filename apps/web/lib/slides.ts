// Pure helpers for editing a post's slides. Every one returns a new array and never changes its input.

/** One slide as stored on the post: a file in the post's own folder, or one of the brand's product photos. */
export type MediaItem = { storage_path: string; bucket?: string | null; width?: number; height?: number };

/** Instagram's carousel maximum. */
export const MAX_SLIDES = 10;

/** Moves the slide at `from` to position `to` (clamped). An unknown slide leaves the order as it is. */
export function moveSlide<T>(items: readonly T[], from: number, to: number): T[] {
  const out = [...items];
  if (!Number.isInteger(from) || from < 0 || from >= out.length) return out;
  const target = Math.min(out.length - 1, Math.max(0, Math.trunc(to)));
  const [moved] = out.splice(from, 1);
  out.splice(target, 0, moved);
  return out;
}

/** Removes the slide at `index`. Returns null instead of leaving a post with no slides. */
export function removeSlide<T>(items: readonly T[], index: number): T[] | null {
  if (items.length <= 1) return null;
  if (!Number.isInteger(index) || index < 0 || index >= items.length) return [...items];
  return items.filter((_, i) => i !== index);
}

/** Adds one of the brand's product photos as the last slide. Returns null past Instagram's 10. */
export function addProduct(media: readonly MediaItem[], assetPath: string): MediaItem[] | null {
  if (!assetPath || media.length >= MAX_SLIDES) return null;
  return [...media, { storage_path: assetPath, bucket: "brand-assets" }];
}

const posInt = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v > 0;

/** Untrusted slides (from the browser) -> the stored shape with only known fields, or null when invalid. */
export function cleanMedia(input: unknown): MediaItem[] | null {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_SLIDES) return null;
  const out: MediaItem[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.storage_path !== "string" || r.storage_path === "") return null;
    const item: MediaItem = { storage_path: r.storage_path };
    if ("bucket" in r) {
      if (r.bucket !== null && r.bucket !== "post-media" && r.bucket !== "brand-assets") return null;
      item.bucket = r.bucket as string | null;
    }
    for (const k of ["width", "height"] as const) {
      if (r[k] === undefined) continue;
      if (!posInt(r[k])) return null;
      item[k] = r[k] as number;
    }
    out.push(item);
  }
  return out;
}
