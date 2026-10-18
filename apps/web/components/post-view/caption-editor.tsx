"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { saveCaption } from "@/app/b/[slug]/posts/[id]/actions";
import {
  joinCaption, parseTags, publishedLength, captionLimit, captionProblem, HARD_LIMIT, MAX_HASHTAGS,
} from "@/app/b/[slug]/posts/[id]/post-data";
import { createSaveQueue, type SaveState } from "@/lib/save-queue";

const DEBOUNCE_MS = 800;
type Value = { caption: string; tags: string };

const sameValue = (a: Value, b: Value) =>
  a.caption === b.caption && parseTags(a.tags).join(" ") === parseTags(b.tags).join(" ");

/**
 * Caption and hashtags, edited in place, kept as stored (the caption is never re-split).
 * Autosaves 800ms after typing stops. flushRef saves any pending edit and resolves false
 * while the caption has a problem or the save failed, so Approve / "Save & decide later" stop.
 */
export function CaptionEditor({ slug, postId, caption, hashtags, editable, onTextChange, flushRef }: {
  slug: string;
  postId: string;
  caption: string;
  hashtags: string[];
  editable: boolean;
  onTextChange: (text: string) => void;
  flushRef: MutableRefObject<(() => Promise<boolean>) | null>;
}) {
  const [value, setValue] = useState<Value>(() => ({ caption, tags: hashtags.join(" ") }));
  const [state, setState] = useState<SaveState>({ kind: "idle", message: null });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<ReturnType<typeof createSaveQueue<Value>> | null>(null);
  if (!queue.current) {
    queue.current = createSaveQueue<Value>({
      initial: { caption, tags: hashtags.join(" ") },
      equals: sameValue,
      validate: (v) => captionProblem(v.caption, parseTags(v.tags)),
      save: (v) => saveCaption(slug, postId, v.caption, parseTags(v.tags)),
      onState: setState,
    });
  }

  useEffect(() => {
    const q = queue.current!;
    flushRef.current = () => {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      return q.flush();
    };
    return () => {
      flushRef.current = null;
      // Closing the view with an edit still waiting: send it anyway.
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      if (q.dirty()) void q.flush();
    };
  }, [flushRef]);

  const tags = parseTags(value.tags);
  const len = publishedLength(value.caption, tags);
  const limit = captionLimit(len);

  if (!editable) {
    return (
      <div>
        <div className="pv-label"><span>Caption</span></div>
        <div className="caption ro">
          <p>{caption}</p>
          {hashtags.length > 0 && <p className="tags">{hashtags.join(" ")}</p>}
        </div>
      </div>
    );
  }

  const change = (next: Value) => {
    setValue(next);
    onTextChange(joinCaption(next.caption, parseTags(next.tags)));
    queue.current!.set(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; void queue.current!.flush(); }, DEBOUNCE_MS);
  };
  const blur = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    void queue.current!.flush();
  };
  // Room left for the caption once the hashtags are counted (hard stop at Instagram's limit).
  const tagRoom = tags.length ? 2 + tags.join(" ").length : 0;

  return (
    <div>
      <div className="pv-label">
        <label htmlFor={`cap-${postId}`}>Caption, click to edit</label>
        <span aria-live="polite">{state.kind === "saving" ? "Saving…" : state.kind === "saved" ? "Saved ✓" : ""}</span>
      </div>
      <textarea
        id={`cap-${postId}`}
        className="caption"
        value={value.caption}
        maxLength={Math.max(value.caption.length, HARD_LIMIT - tagRoom)}
        rows={7}
        aria-describedby={`cap-${postId}-help`}
        onChange={(e) => change({ ...value, caption: e.target.value })}
        onBlur={blur}
      />
      <label className="sr" htmlFor={`tags-${postId}`}>Hashtags</label>
      <input
        id={`tags-${postId}`}
        className="tags-in"
        value={value.tags}
        placeholder={`Hashtags, up to ${MAX_HASHTAGS}`}
        aria-describedby={`cap-${postId}-help`}
        onChange={(e) => change({ ...value, tags: e.target.value })}
        onBlur={blur}
      />
      <p id={`cap-${postId}-help`} className={`cap-help${limit !== "ok" || state.kind === "error" ? " warn" : ""}`} role={state.kind === "error" ? "alert" : undefined}>
        {state.kind === "error" && state.message ? state.message : limit === "ok"
          ? `Up to ${MAX_HASHTAGS} hashtags, separated by spaces.`
          : `${len.toLocaleString("en-GB")} of ${HARD_LIMIT.toLocaleString("en-GB")} characters. Instagram stops at ${HARD_LIMIT.toLocaleString("en-GB")}.`}
      </p>
    </div>
  );
}
