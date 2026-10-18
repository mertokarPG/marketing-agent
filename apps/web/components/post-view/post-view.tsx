"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PostViewData } from "@/app/b/[slug]/posts/[id]/load-post";
import { joinCaption, formatChip, whenLabel } from "@/app/b/[slug]/posts/[id]/post-data";
import { latestRevisionState, REDO_FAILED } from "@/lib/redo";
import { InstagramPreview } from "./instagram-preview";
import { SlideSheet, useSlides, type Slide } from "./slide-sheet";
import { RedoPanel } from "./redo-panel";
import { ReworkingState } from "./reworking-state";
import { VersionList, VersionToggle } from "./version-list";
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
  // The first load's time: a failed redo is reported only when it ended after the post was opened.
  const [loadedAt] = useState(data.loadedAt);
  // Set while a redo is being sent; cleared by itself once the post's content key changes.
  const [lockedFor, setLockedFor] = useState<string | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [seenKey, setSeenKey] = useState(data.contentKey);
  if (seenKey !== data.contentKey) {
    // The post was replaced (status change, redo, restore): show the new current version.
    setSeenKey(data.contentKey);
    setViewing(null);
    setText(joinCaption(post.caption, post.hashtags));
  }
  const locked = lockedFor === data.contentKey;
  const reworking = post.status === "reworking";
  const editable = actions.editable && !locked;

  const slideEdit = useSlides({ slug, postId: post.id, media: data.media, urls: data.slides, resetKey: data.contentKey });
  const version = viewing !== null ? data.versions[viewing] ?? null : null;
  const shown: Slide[] = version ? version.slides.map((url, i) => ({ key: i, item: { storage_path: "" }, url })) : slideEdit.slides;
  const shownUrls = shown.map((s) => s.url);
  const slideCount = shown.length;
  const current = Math.min(slide, Math.max(0, slideCount - 1));
  const rev = latestRevisionState(post.status, data.revisions, loadedAt);

  const flushSlides = slideEdit.flush;
  // Caption and slides both saved (or nothing pending); false stops Approve, Redo and Restore.
  const flush = useCallback(async () => {
    const [c, s] = await Promise.all([flushRef.current?.() ?? Promise.resolve(true), flushSlides()]);
    return c && s;
  }, [flushSlides]);

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
        <div className={`pv-media${reworking ? " dim" : ""}`} aria-busy={reworking || undefined}>
          <div>
            <div className="pv-label">
              <span>{version ? "The previous version" : "How it looks on Instagram"}</span>
              {!reworking && <VersionToggle versions={data.versions} viewing={viewing} onView={(i) => { setViewing(i); setSlide(0); }} />}
            </div>
            <InstagramPreview handle={data.brand.handle} logoUrl={data.brand.logoUrl} slides={shownUrls} current={current} onSelect={setSlide} text={version ? version.text : text} />
          </div>
          <SlideSheet
            slides={shown}
            current={current}
            onSelect={setSlide}
            editable={editable && !version}
            onChange={(next, select) => { slideEdit.change(next); setSlide(select); }}
            save={version ? undefined : slideEdit.save}
            onUndo={slideEdit.undo}
            products={data.products}
            label={version ? (version.count === 1 ? "Its 1 slide" : `Its ${version.count} slides, in order`) : undefined}
          />
        </div>

        <div className="pv-side">
          {reworking
            ? <ReworkingState feedback={rev.kind === "reworking" ? rev.feedback : null} minutes={data.reworkMinutes} />
            : actions.note && <p className="pv-note">{actions.note}</p>}
          {rev.kind === "failed" && <p className="pv-note" role="status">{REDO_FAILED}</p>}
          <TimePicker
            key={`t-${post.id}-${data.contentKey}`}
            slug={slug}
            postId={post.id}
            goesOut={data.goesOut}
            label={whenLabel(post.status)}
            chip={formatChip(slideEdit.slides.length, post.status)}
            editable={editable}
            initial={data.time}
            timezone={data.brand.timezone}
            openInitially={actions.openTimePicker}
            notice={actions.openTimePicker ? PASSED : null}
          />
          {actions.results ? <PostResults metrics={data.metrics} /> : (
            <CaptionEditor
              key={`c-${post.id}-${data.contentKey}`}
              slug={slug}
              postId={post.id}
              caption={post.caption}
              hashtags={post.hashtags}
              editable={editable}
              onTextChange={setText}
              flushRef={flushRef}
            />
          )}
          {post.rationale && <p className="why"><b>Why this post:</b> {post.rationale}</p>}
          <RedoPanel
            key={`r-${post.id}-${data.contentKey}-${post.planned_at}-${post.needs_new_time}`}
            slug={slug}
            postId={post.id}
            availability={data.redo}
            flush={flush}
            onStart={() => setLockedFor(data.contentKey)}
            onDone={(ok) => { if (!ok) setLockedFor(null); }}
            locked={locked}
          />
          <PostActions key={`a-${post.id}`} slug={slug} postId={post.id} view={actions} flush={flush} onAfter={onAfter}
            locked={locked || version !== null} hint={version ? "Back to current to approve." : null} />
          {!reworking && (
            <VersionList
              slug={slug}
              versions={data.versions}
              viewing={viewing}
              onView={(i) => { setViewing(i); setSlide(0); }}
              editable={editable}
              flush={flush}
              onStart={() => setLockedFor(data.contentKey)}
              onDone={(ok) => { if (ok) { setViewing(null); setSlide(0); } else setLockedFor(null); }}
            />
          )}
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
