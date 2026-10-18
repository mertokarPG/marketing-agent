"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PostViewData } from "@/app/b/[slug]/posts/[id]/load-post";
import { joinCaption } from "@/app/b/[slug]/posts/[id]/post-data";
import { InstagramPreview, SlideSheet } from "./instagram-preview";
import { CaptionEditor } from "./caption-editor";
import { TimePicker } from "./time-picker";
import { PostActions, type After } from "./post-actions";
import { PostResults } from "./post-results";

const PASSED = "The planned time has passed. Pick a new time.";
const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function typingIn(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/** The post view: an overlay over the page that opened it, or a full page on direct load. */
export function PostView({ data, variant }: { data: PostViewData; variant: "overlay" | "page" }) {
  const router = useRouter();
  const { slug, post, actions, nav } = data;
  const [slide, setSlide] = useState(0);
  const [text, setText] = useState(() => joinCaption(post.caption, post.hashtags));
  const flushRef = useRef<(() => Promise<boolean>) | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const slideCount = data.slides.length;

  const flush = useCallback(() => flushRef.current?.() ?? Promise.resolve(true), []);

  const close = useCallback(() => {
    void flush();
    if (variant === "overlay") router.back();
    else router.push(`/b/${slug}`);
  }, [flush, router, slug, variant]);

  const go = useCallback(async (id: string) => {
    if (!(await flush())) return; // the caption's problem is shown; don't leave it unsaved
    const href = `/b/${slug}/posts/${id}?review=1`;
    // The full page steps with a real load: a soft navigation would be intercepted into an overlay.
    if (variant === "page") window.location.replace(href);
    else router.replace(href, { scroll: false });
  }, [flush, router, slug, variant]);

  const onAfter = useCallback((what: After) => {
    if (what === "undone") return;
    if (what === "approved" && !nav) return; // stays open, now showing "Approved ✓"
    if (nav?.next && what !== "keep") void go(nav.next);
    else close();
  }, [close, go, nav]);

  // Esc closes; ←/→ step through waiting posts (or slides when not reviewing). Not while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (typingIn(e.target)) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const fwd = e.key === "ArrowRight";
        if (nav) {
          const to = fwd ? nav.next : nav.prev;
          if (to) { e.preventDefault(); void go(to); }
        } else if (slideCount > 1) {
          e.preventDefault();
          setSlide((s) => Math.min(slideCount - 1, Math.max(0, s + (fwd ? 1 : -1))));
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, go, nav, slideCount]);

  // Overlay: move focus in, keep Tab inside, lock page scroll, give focus back on close.
  useEffect(() => {
    if (variant !== "overlay") return;
    const panel = panelRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel?.focus();
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) { e.preventDefault(); panel.focus(); return; }
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onTab);
    return () => {
      document.removeEventListener("keydown", onTab);
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus();
    };
  }, [variant]);

  const titleId = `pv-title-${post.id}`;
  const body = (
    <div
      ref={panelRef}
      className={`pv${variant === "overlay" ? " pv-overlay" : " pv-page"}`}
      role={variant === "overlay" ? "dialog" : undefined}
      aria-modal={variant === "overlay" ? true : undefined}
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <div className="pv-top">
        <h2 id={titleId} className="pv-t wide">{data.weekday} <b>post</b></h2>
        <span className={`tag${data.label.tone === "needs" ? " needs" : ""}`}>{data.label.text}</span>
        <div className="pv-top-end">
          {nav && (
            <span className="pv-step">
              <button type="button" className="linkish" aria-label="Previous post" disabled={!nav.prev} onClick={() => { if (nav.prev) void go(nav.prev); }}>‹</button>
              <span>{nav.index + 1} of {nav.total}</span>
              <button type="button" className="linkish" aria-label="Next post" disabled={!nav.next} onClick={() => { if (nav.next) void go(nav.next); }}>›</button>
            </span>
          )}
          <button type="button" className="linkish pv-close" onClick={close}>Close ✕</button>
        </div>
      </div>

      <div className="pv-body">
        <div className="pv-media">
          <div>
            <div className="pv-label"><span>How it looks on Instagram</span></div>
            <InstagramPreview handle={data.brand.handle} logoUrl={data.brand.logoUrl} slides={data.slides} current={slide} onSelect={setSlide} text={text} />
          </div>
          <SlideSheet slides={data.slides} current={slide} onSelect={setSlide} />
        </div>

        <div className="pv-side">
          {actions.note && <p className="pv-note">{actions.note}</p>}
          <TimePicker
            key={`t-${post.id}`}
            slug={slug}
            postId={post.id}
            goesOut={data.goesOut}
            chip={data.chip}
            editable={actions.editable}
            initial={data.time}
            timezone={data.brand.timezone}
            openInitially={actions.openTimePicker}
            notice={actions.openTimePicker ? PASSED : null}
          />
          {actions.results ? <PostResults metrics={data.metrics} /> : (
            <CaptionEditor
              key={`c-${post.id}`}
              slug={slug}
              postId={post.id}
              caption={post.caption}
              hashtags={post.hashtags}
              editable={actions.editable}
              onTextChange={setText}
              flushRef={flushRef}
            />
          )}
          {post.rationale && <p className="why"><b>Why this post:</b> {post.rationale}</p>}
          <PostActions key={`a-${post.id}`} slug={slug} postId={post.id} view={actions} flush={flush} onAfter={onAfter} />
          {data.lastChanged && <p className="pv-changed">{data.lastChanged}</p>}
        </div>
      </div>
    </div>
  );

  if (variant === "page") return body;
  return (
    <div className="pv-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      {body}
    </div>
  );
}
