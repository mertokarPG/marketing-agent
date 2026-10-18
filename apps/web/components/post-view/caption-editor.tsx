"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { saveCaption } from "@/app/b/[slug]/posts/[id]/actions";
import {
  parseCaption, joinCaption, publishedLength, captionLimit, captionProblem, HARD_LIMIT,
} from "@/app/b/[slug]/posts/[id]/post-data";

const DEBOUNCE_MS = 800;
type State = "idle" | "saving" | "saved" | "error";

/**
 * Caption and trailing #hashtags, edited in place. Autosaves 800ms after typing stops.
 * flushRef lets the actions save a pending edit before approving or closing.
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
  const initial = joinCaption(caption, hashtags);
  const [text, setText] = useState(initial);
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const saved = useRef(initial);
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(async (value: string): Promise<boolean> => {
    pending.current = null;
    if (value === saved.current) return true;
    const parsed = parseCaption(value);
    const problem = captionProblem(parsed.caption, parsed.hashtags);
    if (problem) { setState("error"); setMessage(problem); return false; }
    setState("saving");
    const res = await saveCaption(slug, postId, parsed.caption, parsed.hashtags);
    if (!res.ok) { setState("error"); setMessage(res.message); return false; }
    saved.current = value;
    setState("saved");
    setMessage(null);
    return true;
  }, [slug, postId]);

  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    return pending.current === null ? true : save(pending.current);
  }, [save]);

  useEffect(() => {
    flushRef.current = flush;
    return () => { flushRef.current = null; };
  }, [flush, flushRef]);

  // Closing the view with an edit still waiting: send it anyway.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (pending.current !== null) void save(pending.current);
  }, [save]);

  const parsed = parseCaption(text);
  const len = publishedLength(parsed.caption, parsed.hashtags);
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

  return (
    <div>
      <div className="pv-label">
        <label htmlFor={`cap-${postId}`}>Caption, click to edit</label>
        <span aria-live="polite">{state === "saving" ? "Saving…" : state === "saved" ? "Saved ✓" : ""}</span>
      </div>
      <textarea
        id={`cap-${postId}`}
        className="caption"
        value={text}
        maxLength={HARD_LIMIT}
        rows={7}
        aria-describedby={`cap-${postId}-help`}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          onTextChange(v);
          setState("idle");
          setMessage(null);
          pending.current = v;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => { timer.current = null; void save(v); }, DEBOUNCE_MS);
        }}
        onBlur={() => { void flush(); }}
      />
      <p id={`cap-${postId}-help`} className={`cap-help${limit !== "ok" || message ? " warn" : ""}`} role={message ? "alert" : undefined}>
        {message ?? (limit === "ok"
          ? "Hashtags go on the last line, up to 5."
          : `${len.toLocaleString("en-GB")} of ${HARD_LIMIT.toLocaleString("en-GB")} characters. Instagram stops at ${HARD_LIMIT.toLocaleString("en-GB")}.`)}
      </p>
    </div>
  );
}
