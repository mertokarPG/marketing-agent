/** Instagram's caption limit, counted the way it is published: caption + "\n\n" + hashtags joined by spaces. */
export const MAX_PUBLISHED_CAPTION = 2200;
/** Same cap the dashboard's caption RPC enforces. */
export const MAX_HASHTAGS = 5;

export const publishedLength = (caption: string, hashtags: string[]) =>
  caption.length + (hashtags.length > 0 ? 2 + hashtags.join(" ").length : 0);

/**
 * Why a caption can't be saved, as the tail of a tool rejection, or null when it can. Mirrors the dashboard's
 * update_post_caption rules so the owner can always save what the agent wrote.
 */
export function captionRejection(caption: string, hashtags: string[]): string | null {
  if (caption.trim() === "") return "the caption is empty. Write one.";
  if (hashtags.length > MAX_HASHTAGS) return `use at most ${MAX_HASHTAGS} hashtags (got ${hashtags.length}).`;
  if (hashtags.some((h) => h.trim() === "" || h.length > 100)) return "each hashtag must be non-empty and at most 100 characters.";
  if (publishedLength(caption, hashtags) > MAX_PUBLISHED_CAPTION)
    return `caption plus hashtags exceed Instagram's ${MAX_PUBLISHED_CAPTION} characters. Shorten it.`;
  return null;
}
