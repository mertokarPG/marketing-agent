"use client";

import { useState, useTransition } from "react";
import { reschedule } from "@/app/b/[slug]/posts/[id]/actions";
import { isPastLocal, validLocalTime } from "@/app/b/[slug]/posts/[id]/post-data";

/** "Goes out" line with the format chip, and a date + time picker in the brand's timezone. */
export function TimePicker({ slug, postId, goesOut, label, chip, editable, initial, timezone, openInitially, notice }: {
  slug: string;
  postId: string;
  goesOut: string;
  label: string;
  chip: string;
  editable: boolean;
  initial: { ymd: string; hhmm: string; minYmd: string };
  timezone: string;
  openInitially: boolean;
  notice: string | null;
}) {
  const [open, setOpen] = useState(openInitially);
  const [ymd, setYmd] = useState(initial.ymd);
  const [hhmm, setHhmm] = useState(initial.hhmm);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const submit = () => {
    if (!validLocalTime(ymd, hhmm)) { setError("Pick a date and a time."); return; }
    if (isPastLocal(ymd, hhmm, timezone, new Date())) { setError("That time has already passed. Pick a time in the future."); return; }
    setError(null);
    start(async () => {
      const res = await reschedule(slug, postId, ymd, hhmm);
      if (res.ok) setOpen(false); else setError(res.message);
    });
  };

  return (
    <div>
      <div className="pv-label">
        <span>{label}</span>
        {editable && !open && <button type="button" className="linkish" onClick={() => setOpen(true)}>Change time</button>}
      </div>
      <div className="when"><span className="d wide">{goesOut}</span><span className="chip">{chip}</span></div>
      {editable && open && (
        <form className="time-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          {notice && <p className="cap-help warn">{notice}</p>}
          <div className="time-row">
            <label>
              <span className="sr">Date</span>
              <input type="date" value={ymd} min={initial.minYmd} required onChange={(e) => setYmd(e.target.value)} />
            </label>
            <label>
              <span className="sr">Time</span>
              <input type="time" value={hhmm} required onChange={(e) => setHhmm(e.target.value)} />
            </label>
            <button type="submit" className="pill" disabled={busy}>{busy ? "Saving…" : "Save time"}</button>
            {!openInitially && <button type="button" className="linkish" onClick={() => { setOpen(false); setError(null); }}>Cancel</button>}
          </div>
          <p className="cap-help">{(timezone.split("/").pop() ?? timezone).replace(/_/g, " ")} time.</p>
          {error && <p className="cap-help warn" role="alert">{error}</p>}
        </form>
      )}
    </div>
  );
}
