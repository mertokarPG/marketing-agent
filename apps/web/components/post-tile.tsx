import Link from "next/link";
import { postLabel } from "@/lib/labels";
import { postTitle } from "@/app/b/[slug]/home-data";

export type TilePost = { id: string; status: string; planned_at: string; needs_new_time: boolean; caption: string | null };

export function PostTile({ post, href, thumb, brand, now, rework, redone = false, redoFailed = false }: {
  post: TilePost;
  href: string;
  thumb: string | null;
  brand: { publisher: string | null };
  now: Date;
  /** "Reworking: 'more playful'… about 2 minutes" while the agent redoes this post. */
  rework?: string | null;
  /** The agent's redo came back untouched: "New version · needs your OK". */
  redone?: boolean;
  /** The agent's redo failed and nobody has touched the post since: "Redo didn't work · needs your OK". */
  redoFailed?: boolean;
}) {
  const label = postLabel(post, brand, now, { redone, redoFailed });
  const reworking = post.status === "reworking";
  return (
    <div className="post-tile">
      <Link href={href} className={`tile${reworking ? " reworking" : ""}`} aria-label={`Open post: ${postTitle(post.caption)}`}>
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" loading="lazy" />
        ) : (
          <span className="tile-ph wide">{postTitle(post.caption, 6)}</span>
        )}
        {reworking && <span className="veil">{rework ?? "Reworking…"}</span>}
      </Link>
      <span className={`tag${label.tone === "needs" ? " needs" : ""}`}>{label.text}</span>
    </div>
  );
}
