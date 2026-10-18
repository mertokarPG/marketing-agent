export type SaveState = { kind: "idle" | "saving" | "saved" | "error"; message: string | null };
type Result = { ok: true } | { ok: false; message: string };

/**
 * Autosave bookkeeping, one save at a time. flush() waits for a save in flight, then saves the
 * current value if it differs from the last saved one. It returns false while the value has a
 * problem or the save failed, so callers (Approve, "Save & decide later") can stop.
 */
export function createSaveQueue<T>(opts: {
  initial: T;
  equals: (a: T, b: T) => boolean;
  validate: (v: T) => string | null;
  save: (v: T) => Promise<Result>;
  onState: (s: SaveState) => void;
}) {
  let current = opts.initial;
  let saved = opts.initial;
  let inflight: Promise<boolean> | null = null;

  async function flush(): Promise<boolean> {
    while (inflight) await inflight;
    const value = current;
    if (opts.equals(value, saved)) return true;
    const problem = opts.validate(value);
    if (problem) { opts.onState({ kind: "error", message: problem }); return false; }
    opts.onState({ kind: "saving", message: null });
    const p = (async () => {
      let res: Result;
      try { res = await opts.save(value); } catch { res = { ok: false, message: "Something went wrong. Please try again." }; }
      if (!res.ok) { opts.onState({ kind: "error", message: res.message }); return false; }
      saved = value;
      if (opts.equals(current, value)) opts.onState({ kind: "saved", message: null });
      return true;
    })();
    inflight = p;
    const ok = await p;
    if (inflight === p) inflight = null;
    if (!ok) return false;
    // Typed more while that save ran: save the newer text too.
    return opts.equals(current, saved) ? true : flush();
  }

  return {
    set(v: T) { current = v; opts.onState({ kind: "idle", message: null }); },
    dirty: () => !opts.equals(current, saved),
    /** Forget the unsaved value (the user chose to discard it). */
    discard() { current = saved; opts.onState({ kind: "idle", message: null }); },
    flush,
  };
}
