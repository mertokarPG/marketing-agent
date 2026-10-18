"use client";

import { useState, useTransition } from "react";
import { requestRedo, type ActionResult } from "@/app/b/[slug]/posts/[id]/actions";
import { QUICK_PICKS, REDO_MAX, redoFeedback, type RedoAvailability } from "@/lib/redo";
import { FALLBACK } from "@/lib/rpc-errors";

const NOT_SAVED = "Some changes aren't saved yet. Fix the problem shown above first.";

/**
 * "Not quite right? Ask the agent": free text plus quick picks, sent as one piece of feedback.
 * Hidden for viewers and posts that can't change; shows the reason instead when a redo isn't possible.
 */
export function RedoPanel({ slug, postId, availability, flush, onStart, onDone, locked = false }: {
  slug: string;
  postId: string;
  availability: RedoAvailability;
  flush: () => Promise<boolean>;
  /** Called as the request starts, so the post view can lock its edit controls. */
  onStart: () => void;
  /** Called with whether the redo was accepted. */
  onDone: (ok: boolean) => void;
  /** Something else (a restore) is changing the post: wait for it. */
  locked?: boolean;
}) {
  const [typed, setTyped] = useState("");
  const [picks, setPicks] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const busy = pending || locked;

  if (!availability.show) return null;
  const reason = refused ?? (availability.allowed ? null : availability.reason);
  const feedback = redoFeedback(typed, picks);
  const tooLong = feedback.length > REDO_MAX;

  const toggle = (p: string) => setPicks((ps) => (ps.includes(p) ? ps.filter((x) => x !== p) : [...ps, p]));
  const send = () => {
    if (!feedback || tooLong) return;
    setError(null);
    start(async () => {
      if (!(await flush())) { setError(NOT_SAVED); return; }
      onStart();
      let res: ActionResult;
      try { res = await requestRedo(slug, postId, feedback); } catch { res = { ok: false, message: FALLBACK }; }
      onDone(res.ok);
      if (res.ok) return;
      // A refusal (too close, limit, paused…) replaces the box; an unknown error can be retried.
      if (res.message === FALLBACK) setError(res.message);
      else setRefused(res.message);
    });
  };

  return (
    <div className="redo">
      <div className="pv-label"><span>Not quite right? Ask the agent</span></div>
      {reason ? <p className="redo-reason">{reason}</p> : (
        <form onSubmit={(e) => { e.preventDefault(); send(); }}>
          <div className="redo-in">
            <label className="sr" htmlFor={`redo-${postId}`}>What should the agent change?</label>
            <textarea
              id={`redo-${postId}`}
              rows={2}
              value={typed}
              maxLength={REDO_MAX}
              placeholder={`e.g. "more playful, and use the rose oil photo"`}
              disabled={busy}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}
            />
            <button type="submit" className="pill" disabled={busy || !feedback || tooLong}>{busy ? "Sending…" : "Redo ↳"}</button>
          </div>
          <div className="quick" role="group" aria-label="Quick picks">
            {QUICK_PICKS.map((p) => (
              <button key={p} type="button" className="quick-pick" aria-pressed={picks.includes(p)} disabled={busy} onClick={() => toggle(p)}>{p}</button>
            ))}
          </div>
          {tooLong && <p className="cap-help warn">Keep it under {REDO_MAX} characters.</p>}
          {error && <p className="cap-help warn" role="alert">{error}</p>}
        </form>
      )}
    </div>
  );
}
