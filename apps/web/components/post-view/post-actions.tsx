"use client";

import { useEffect, useState, useTransition } from "react";
import { approve, unapprove, skip, type ActionResult } from "@/app/b/[slug]/posts/[id]/actions";
import type { PostActionsView } from "@/app/b/[slug]/posts/[id]/post-data";

export type After = "approved" | "skipped" | "later" | "keep" | "undone";

/** The buttons at the bottom of the right column, by status and mode. Viewers and read-only posts get none. */
export function PostActions({ slug, postId, view, flush, onAfter, locked = false }: {
  slug: string;
  postId: string;
  view: PostActionsView;
  flush: () => Promise<boolean>;
  onAfter: (what: After) => void;
  /** A redo is being sent: nothing may change the post meanwhile. */
  locked?: boolean;
}) {
  const [pending, start] = useTransition();
  const busy = pending || locked;
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const run = (what: After, fn: () => Promise<ActionResult>, saveFirst = true) => {
    setError(null);
    start(async () => {
      if (saveFirst && !(await flush())) { setError("Some changes aren't saved yet. Fix the problem shown above first."); return; }
      const res = await fn();
      if (!res.ok) { setError(res.message); return; }
      setConfirming(false);
      onAfter(what);
    });
  };
  // Esc while the skip question is open answers "Cancel" instead of closing the post.
  useEffect(() => {
    if (!confirming) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setConfirming(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [confirming]);

  const later = (what: After) => run(what, async () => ({ ok: true }));

  if (view.kind === "none") return null;

  const skipLabel = view.kind === "autopilot" ? "Pull this post" : "Skip this post";
  const confirmBox = confirming && (
    <div className="confirm" role="group" aria-label={skipLabel}>
      <span>{view.kind === "autopilot" ? "Pull it? It won't go out." : "Skip it? It won't go out."}</span>
      <button type="button" className="pill" disabled={busy} onClick={() => run("skipped", () => skip(slug, postId), false)}>
        {view.kind === "autopilot" ? "Yes, pull it" : "Yes, skip it"}
      </button>
      <button type="button" className="linkish" onClick={() => setConfirming(false)}>Cancel</button>
    </div>
  );

  return (
    <div className="pv-actions-wrap">
      {view.kind === "review" && (
        <div className="pv-actions">
          <button type="button" className="pill" disabled={busy || !!view.approveBlocked} aria-describedby={view.approveBlocked ? `ab-${postId}` : undefined}
            onClick={() => run("approved", () => approve(slug, postId))}>Approve ↳</button>
          <button type="button" className="pill ghost" disabled={busy} onClick={() => later("later")}>Save &amp; decide later</button>
          <button type="button" className="linkish skip" disabled={busy} onClick={() => setConfirming(true)}>{skipLabel}</button>
        </div>
      )}
      {view.kind === "approved" && (
        <div className="pv-actions">
          <span className="pill done" role="status">Approved ✓</span>
          <button type="button" className="linkish" disabled={busy} onClick={() => run("undone", () => unapprove(slug, postId), false)}>Undo</button>
          <button type="button" className="linkish skip" disabled={busy} onClick={() => setConfirming(true)}>{skipLabel}</button>
        </div>
      )}
      {view.kind === "autopilot" && (
        <div className="pv-actions">
          <button type="button" className="pill" disabled={busy} onClick={() => later("keep")}>Keep</button>
          <button type="button" className="linkish skip" disabled={busy} onClick={() => setConfirming(true)}>{skipLabel}</button>
        </div>
      )}
      {view.approveBlocked && <p id={`ab-${postId}`} className="cap-help warn">{view.approveBlocked}</p>}
      {confirmBox}
      {error && <p className="cap-help warn" role="alert">{error}</p>}
    </div>
  );
}
