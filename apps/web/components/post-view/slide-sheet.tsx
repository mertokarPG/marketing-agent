"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { saveSlides } from "@/app/b/[slug]/posts/[id]/actions";
import type { ProductView } from "@/app/b/[slug]/posts/[id]/load-post";
import { addProduct, moveSlide, removeSlide, MAX_SLIDES, type MediaItem } from "@/lib/slides";
import { createSaveQueue, type SaveState } from "@/lib/save-queue";
import { ProductPicker } from "./product-picker";

export type Slide = { key: number; item: MediaItem; url: string | null };

const IDLE: SaveState = { kind: "idle", message: null };
const sameMedia = (a: MediaItem[], b: MediaItem[]) =>
  a.length === b.length && a.every((m, i) => m.storage_path === b[i].storage_path && (m.bucket ?? null) === (b[i].bucket ?? null));

let seq = 0;
const toSlides = (media: MediaItem[], urls: (string | null)[]): Slide[] =>
  media.map((item, i) => ({ key: ++seq, item, url: urls[i] ?? null }));

/**
 * The post's slides as edited here, saved one change at a time (in order) through update_post_media.
 * Resets to the stored slides when `resetKey` changes (status change, redo, restore) or on "Undo".
 * flush() resolves false while a slide change isn't saved, so Approve and Redo wait for it.
 */
export function useSlides({ slug, postId, media, urls, resetKey }: {
  slug: string;
  postId: string;
  media: MediaItem[];
  urls: (string | null)[];
  resetKey: string;
}) {
  const [undoCount, setUndoCount] = useState(0);
  const key = `${resetKey}#${undoCount}`;
  const [st, setSt] = useState(() => ({ key, slides: toSlides(media, urls) }));
  const [save, setSave] = useState<SaveState>(IDLE);
  const queue = useRef<{ key: string; q: ReturnType<typeof createSaveQueue<MediaItem[]>> } | null>(null);

  let slides = st.slides;
  if (st.key !== key) {
    // New content from the server (or an undo): start again from what is stored.
    slides = toSlides(media, urls);
    setSt({ key, slides });
    setSave(IDLE);
  }
  if (!queue.current || queue.current.key !== key) {
    const k = key;
    queue.current = {
      key,
      q: createSaveQueue<MediaItem[]>({
        initial: media,
        equals: sameMedia,
        validate: (m) => (m.length < 1 || m.length > MAX_SLIDES ? "A post needs between 1 and 10 photos." : null),
        save: (m) => saveSlides(slug, postId, m),
        // A save from before a reset must not overwrite the new state's message.
        onState: (s) => { if (queue.current?.key === k) setSave(s); },
      }),
    };
  }

  const change = (next: Slide[]) => {
    setSt({ key, slides: next });
    const q = queue.current!.q;
    q.set(next.map((s) => s.item));
    void q.flush();
  };
  // Stable, so the post view's keyboard and close handlers don't re-subscribe every render.
  const flush = useCallback(() => queue.current!.q.flush(), []);
  const undo = useCallback(() => setUndoCount((n) => n + 1), []);
  return { slides, save, change, flush, undo };
}

/** Numbered contact sheet of every slide. Owners and editors can drag (or Alt+←/→) to reorder, ✕ to remove, and add product photos. */
export function SlideSheet({ slides, current, onSelect, editable, onChange, save, onUndo, products, label }: {
  slides: Slide[];
  current: number;
  onSelect: (i: number) => void;
  editable: boolean;
  onChange?: (next: Slide[], select: number) => void;
  save?: SaveState;
  onUndo?: () => void;
  products?: ProductView[] | null;
  label?: string;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const tiles = useRef(new Map<number, HTMLButtonElement>());
  const drag = useRef<{ from: number; pointerId: number; x: number; y: number; touch: boolean; armed: boolean; el: HTMLElement; timer: ReturnType<typeof setTimeout> | null } | null>(null);
  const suppressClick = useRef(false);
  const [dragging, setDragging] = useState<{ from: number; over: number } | null>(null);
  const [focusKey, setFocusKey] = useState<number | null>(null);
  const [said, setSaid] = useState("");
  const [picking, setPicking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const canEdit = editable && !!onChange;

  // Keep keyboard focus on the slide that moved (or its neighbour after a removal).
  useEffect(() => {
    if (focusKey === null) return;
    tiles.current.get(focusKey)?.focus();
    setFocusKey(null);
  }, [focusKey, slides]);

  // While a touch drag is on, stop the page from scrolling under the finger.
  useEffect(() => {
    const el = listRef.current;
    if (!el || !canEdit) return;
    const onMove = (e: TouchEvent) => { if (drag.current?.armed) e.preventDefault(); };
    el.addEventListener("touchmove", onMove, { passive: false });
    return () => el.removeEventListener("touchmove", onMove);
  }, [canEdit]);

  useEffect(() => () => { if (drag.current?.timer) clearTimeout(drag.current.timer); }, []);

  if (!slides.length && !canEdit) return null;

  const move = (from: number, to: number) => {
    if (!onChange || to === from || to < 0 || to >= slides.length) return;
    const next = moveSlide(slides, from, to);
    onChange(next, to);
    setFocusKey(slides[from].key);
    setSaid(`Slide moved to position ${to + 1} of ${slides.length}.`);
  };
  const remove = (i: number) => {
    if (!onChange) return;
    const next = removeSlide(slides, i);
    if (!next) { setProblem("A post needs at least one photo."); return; }
    setProblem(null);
    onChange(next, Math.min(current > i ? current - 1 : current, next.length - 1));
    const neighbour = next[Math.min(i, next.length - 1)];
    if (neighbour) setFocusKey(neighbour.key);
    setSaid(`Slide ${i + 1} removed.`);
  };
  const add = (p: ProductView) => {
    if (!onChange) return;
    const next = addProduct(slides.map((s) => s.item), p.path);
    if (!next) { setProblem(`Instagram allows up to ${MAX_SLIDES} photos in a post.`); return; }
    setProblem(null);
    const slide: Slide = { key: ++seq, item: next[next.length - 1], url: p.url };
    onChange([...slides, slide], slides.length);
    setPicking(false);
    setFocusKey(slide.key);
    setSaid(`Product photo added as slide ${slides.length + 1}.`);
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (!canEdit || !e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    // Alt+←/→ reorders; plain ←/→ is left to the post view (stepping posts or slides).
    e.preventDefault();
    e.stopPropagation();
    move(i, i + (e.key === "ArrowRight" ? 1 : -1));
  };

  const endDrag = () => {
    const d = drag.current;
    if (d?.timer) clearTimeout(d.timer);
    drag.current = null;
    setDragging(null);
  };
  const arm = () => {
    const d = drag.current;
    if (!d) return;
    d.armed = true;
    d.timer = null;
    try { d.el.setPointerCapture(d.pointerId); } catch { /* the pointer may already be gone */ }
    setDragging({ from: d.from, over: d.from });
  };
  const onPointerDown = (e: PointerEvent<HTMLButtonElement>, i: number) => {
    if (!canEdit || e.button !== 0 || slides.length < 2) return;
    const touch = e.pointerType === "touch";
    // Touch needs a short hold first, so a swipe still scrolls the page.
    drag.current = { from: i, pointerId: e.pointerId, x: e.clientX, y: e.clientY, touch, armed: false, el: e.currentTarget, timer: null };
    if (touch) drag.current.timer = setTimeout(arm, 350);
  };
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (!d.armed) {
      const dist = Math.hypot(e.clientX - d.x, e.clientY - d.y);
      if (d.touch && dist > 8) endDrag();
      else if (!d.touch && dist > 6) arm();
      return;
    }
    const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-slide]");
    if (hit && listRef.current?.contains(hit)) {
      const over = Number(hit.dataset.slide);
      setDragging((s) => (s && s.over !== over ? { ...s, over } : s));
    }
  };
  const onPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (d.armed) {
      suppressClick.current = true;
      if (dragging && dragging.over !== d.from) move(d.from, dragging.over);
    }
    endDrag();
  };

  const many = slides.length > 1;
  const title = label ?? (slides.length === 1 ? "The slide" : `All ${slides.length} slides, in order`);
  const status = save?.kind === "saving" ? "Saving…" : save?.kind === "saved" ? "Saved ✓" : canEdit && many ? "Drag to reorder · ✕ to remove" : "";

  return (
    <div className="sheet">
      <div className="pv-label"><span>{title}</span><span aria-live="polite">{status}</span></div>
      <ol ref={listRef} className={`slides${canEdit ? " editing" : ""}`} aria-describedby={canEdit && many ? "slides-help" : undefined}>
        {slides.map((s, i) => {
          const from = dragging?.from === i;
          const over = dragging && dragging.over === i && !from;
          return (
            <li key={s.key} data-slide={i} className={`${from ? "drag-from" : ""}${over ? " drag-over" : ""}`.trim() || undefined}>
              <button
                ref={(el) => { if (el) tiles.current.set(s.key, el); else tiles.current.delete(s.key); }}
                type="button"
                className={`slide${i === current ? " on" : ""}`}
                aria-label={`Slide ${i + 1} of ${slides.length}`}
                aria-current={i === current || undefined}
                onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } onSelect(i); }}
                onKeyDown={(e) => onKey(e, i)}
                onPointerDown={(e) => onPointerDown(e, i)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={endDrag}
                onContextMenu={(e) => { if (drag.current) e.preventDefault(); }}
              >
                {s.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.url} alt="" loading="lazy" draggable={false} />
                ) : null}
                <span className="wide">{String(i + 1).padStart(2, "0")}.</span>
              </button>
              {canEdit && many && (
                <button type="button" className="slide-x" aria-label={`Remove slide ${i + 1}`} onClick={() => remove(i)}>✕</button>
              )}
            </li>
          );
        })}
        {canEdit && slides.length < MAX_SLIDES && (
          <li>
            <button type="button" className="slide add" aria-expanded={picking} onClick={() => setPicking((p) => !p)}>+ Add a product photo</button>
          </li>
        )}
      </ol>
      {canEdit && many && <p id="slides-help" className="sr">Alt plus the left or right arrow moves the focused slide.</p>}
      <p className="sr" aria-live="polite">{said}</p>
      {picking && canEdit && <ProductPicker products={products ?? []} onPick={add} onClose={() => setPicking(false)} />}
      {problem && <p className="cap-help warn" role="alert">{problem}</p>}
      {save?.kind === "error" && (
        <p className="cap-help warn" role="alert">
          {save.message} {onUndo && <button type="button" className="linkish" onClick={onUndo}>Undo slide changes</button>}
        </p>
      )}
    </div>
  );
}
