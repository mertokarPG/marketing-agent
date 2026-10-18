"use client";

import { useEffect, useRef } from "react";
import type { ProductView } from "@/app/b/[slug]/posts/[id]/load-post";

/** The brand's product photos, to add one as a slide. Esc closes the picker, not the post. */
export function ProductPicker({ products, onPick, onClose }: {
  products: ProductView[];
  onPick: (p: ProductView) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    (ref.current?.querySelector<HTMLElement>(".picker-grid button") ?? ref.current?.querySelector<HTMLElement>("button"))?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      closeRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <div ref={ref} className="picker" role="group" aria-label="Product photos">
      <div className="pv-label">
        <span>Your product photos</span>
        <button type="button" className="linkish" onClick={onClose}>Close</button>
      </div>
      {products.length === 0 ? (
        <p className="cap-help">No product photos yet. Add them on the Brand page soon.</p>
      ) : (
        <ul className="picker-grid">
          {products.map((p) => (
            <li key={p.path}>
              <button type="button" className="slide" aria-label={`Add ${p.label ?? "this product photo"}`} onClick={() => onPick(p)}>
                {p.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.url} alt="" loading="lazy" draggable={false} />
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
