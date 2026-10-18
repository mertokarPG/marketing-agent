"use client";

import { useState, useTransition } from "react";
import { restoreVersion, type ActionResult } from "@/app/b/[slug]/posts/[id]/actions";
import { FALLBACK } from "@/lib/rpc-errors";
import type { VersionView } from "@/app/b/[slug]/posts/[id]/load-post";

const NOT_SAVED = "Some changes aren't saved yet. Fix the problem shown above first.";

/** "Previous version" / "Back to current" next to the preview. */
export function VersionToggle({ versions, viewing, onView }: {
  versions: VersionView[];
  viewing: number | null;
  onView: (i: number | null) => void;
}) {
  if (!versions.length) return null;
  return viewing === null
    ? <button type="button" className="linkish" onClick={() => onView(0)}>Previous version</button>
    : <button type="button" className="linkish" onClick={() => onView(null)}>Back to current</button>;
}

/** Earlier versions of the post, newest first, each one viewable and (for owners and editors) restorable. */
export function VersionList({ slug, versions, viewing, onView, editable, flush, onStart, onDone }: {
  slug: string;
  versions: VersionView[];
  viewing: number | null;
  onView: (i: number | null) => void;
  editable: boolean;
  flush: () => Promise<boolean>;
  /** Called as the restore is sent, so the post view can lock its edit controls. */
  onStart: () => void;
  onDone: (ok: boolean) => void;
}) {
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!versions.length) return null;

  const restore = (id: string) => {
    setError(null);
    start(async () => {
      // An edit still on its way would land on top of the restored version: save it first.
      if (!(await flush())) { setError(NOT_SAVED); return; }
      onStart();
      let res: ActionResult;
      try { res = await restoreVersion(slug, id); } catch { res = { ok: false, message: FALLBACK }; }
      onDone(res.ok);
      if (!res.ok) setError(res.message);
    });
  };

  return (
    <div className="versions">
      <div className="pv-label"><span>Earlier versions</span></div>
      <ol>
        {versions.map((v, i) => (
          <li key={v.id} className={viewing === i ? "on" : undefined}>
            <button type="button" className="linkish v-label" aria-pressed={viewing === i} onClick={() => onView(viewing === i ? null : i)}>{v.label}</button>
            {editable && <button type="button" className="pill ghost sm" disabled={busy} onClick={() => restore(v.id)}>Restore</button>}
          </li>
        ))}
      </ol>
      {error && <p className="cap-help warn" role="alert">{error}</p>}
    </div>
  );
}
