"use client";

import { previewCaption } from "@/app/b/[slug]/posts/[id]/post-data";

/** How the post looks in the Instagram feed: handle, avatar, current slide, dots, two-line caption. */
export function InstagramPreview({ handle, logoUrl, slides, current, onSelect, text }: {
  handle: string;
  logoUrl: string | null;
  slides: (string | null)[];
  current: number;
  onSelect: (i: number) => void;
  text: string;
}) {
  const cap = previewCaption(text);
  const src = slides[current] ?? null;
  const many = slides.length > 1;
  return (
    <div className="ig" aria-label="Preview of the post on Instagram">
      <div className="ig-head">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="ig-av" src={logoUrl} alt="" />
        ) : <span className="ig-av" aria-hidden="true" />}
        <b>{handle}</b>
        <span className="ig-more" aria-hidden="true">•••</span>
      </div>
      <div className="ig-img">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={`Slide ${current + 1} of ${slides.length}`} />
        ) : <span className="ig-ph">No image</span>}
        {many && <span className="ig-count">{current + 1}/{slides.length}</span>}
        {many && current > 0 && (
          <button type="button" className="ig-arrow l" aria-label="Previous slide" onClick={() => onSelect(current - 1)}>‹</button>
        )}
        {many && current < slides.length - 1 && (
          <button type="button" className="ig-arrow r" aria-label="Next slide" onClick={() => onSelect(current + 1)}>›</button>
        )}
      </div>
      <div className="ig-icons" aria-hidden="true">♡ ◯ ➤<span>⌑</span></div>
      {many && (
        <div className="ig-dots">
          {slides.map((_, i) => (
            <button key={i} type="button" className={i === current ? "on" : undefined} aria-label={`Show slide ${i + 1}`} aria-current={i === current || undefined} onClick={() => onSelect(i)} />
          ))}
        </div>
      )}
      <p className="ig-cap"><b>{handle}</b> {cap.more ? <>{cap.text.replace(/…$/, "")}… <span className="ig-dim">more</span></> : cap.text}</p>
    </div>
  );
}
