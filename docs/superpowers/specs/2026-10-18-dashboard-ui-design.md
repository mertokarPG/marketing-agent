# Carepost dashboard UI: design (sub-project 3)

Date: 2026-10-18. Status: draft for approval.
Builds on sub-project 1 (foundation, `docs/superpowers/specs/2026-10-17-saas-foundation-design.md`). Sub-project 2 (Meta publishing), 4 (onboarding/brand page) and 5 (billing) are separate.

## 1. Intent

Carepost drafts and posts Instagram content for small brands. Its users are non-technical brand managers (launch brands: carephoto, then Kuanyin Skin and corterafashion). Today the web app is an unstyled table that proves the plumbing works.

This sub-project builds the real interface. The feeling a brand manager must get in the first five seconds is **relief, with control**: "my Instagram is handled, nothing goes out that I haven't seen, and I can tell at a glance whether anything needs me." The biggest fear we design against is "what if it posts something embarrassing", so every screen says *you're in charge* before it says anything clever.

## 2. Goals, non-goals, anti-goals

**Goals**
- A home screen that answers "does anything need me?" and "what's going out this week?" in one look.
- A post view where a brand manager can approve a draft, fix it themselves, or ask the agent to redo it.
- A results page that answers "is this working, is it worth what I pay?" in plain words.
- A distinctive look (section 4) that feels designed, not like a generic AI/SaaS dashboard, with a carephoto family resemblance.
- Works well on a phone (brand managers check on the go).

**Non-goals (this sub-project)**
- The brand page / onboarding (logo, product photo upload, tone): sub-project 4. A simple placeholder page only.
- Connecting Instagram, real publishing changes: sub-project 2.
- Billing, plans, redo quotas in money terms: sub-project 5.
- Analytics depth: hashtag analytics, demographics, exports, per-post tables.
- Editing text or design *inside* slide images (that goes through "Ask the agent").

**Anti-goals (a failure even if it technically works)**
- Looks like an analytics dashboard or an admin panel (tables, jargon, dense numbers).
- Looks "AI-generic": rainbow pastel gradients, glassmorphism everywhere, glowing chips.
- Any internal term visible to users: `pending_approval`, `core`, `timely`, `run`, `kind`.
- A post goes out that the brand manager in review mode didn't approve.

## 3. Constraints (from the existing system)

- **Stack:** `apps/web` is Next 16.3.8 / React 19.3.0 with `@supabase/ssr` 0.12.7 (`proxy.ts`), magic-link login, deployed to Vercel later. Server components read with the user's session.
- **Security model (must stay):** the web app uses the **anon key + the user's session only**. The service-role key never goes to the web app or Vercel. RLS today is **SELECT-only** for brand members (`is_brand_member`). Therefore every write from the web app goes through **Postgres `SECURITY DEFINER` functions (RPC)** that check membership *and role* themselves. Roles: `owner` and `editor` can change posts; `viewer` is read-only.
- **Data:** `posts` (statuses `pending_approval, approved, publishing, published, failed, rejected, expired`; `media` jsonb array of `{storage_path, …}` in the private `post-media` bucket; `rationale` text; `planned_at` timestamptz), `post_metrics` (likes, comments, shares, reach, impressions, views, saves, profile_visits, link_clicks, measured_at), `brands` (`approval_mode review|autopilot`, `status`, `timezone`, `posting_schedule`, `instagram_handle`), `brand_assets` (kinds `logo, font, icon, product`, bucket `brand-assets`), `agent_runs` (kinds `weekly_plan, daily_check, manual`).
- **Images** are private: render via signed URLs created server-side (current page uses TTL 600s).
- **Times** are always shown in the brand's timezone (Europe/Brussels for all launch brands).
- **Worker invariants stay:** duplicate guards in `save_post`, the run queue (`FOR UPDATE SKIP LOCKED`, attempts, heartbeat), paused brands get no runs, manual runs stay CLI-only.
- Do not weaken the agent's creative guidance in `system-prompt.ts` (Moment-of-the-Week, multi-post permission, energy axis, wildcard slot, moment-fit check).

## 4. Visual language (decided)

Inspired by jolt.digital's design language, adapted to Carepost (not copied: own name, own wording, no jolt assets). The user approved the mockups listed in section 10.

**Colour tokens**

| Token | Hex | Use |
|---|---|---|
| `ink` | `#060117` | page background (dark), text (light) |
| `violet` | `#1A0543` | cards, tags, input backgrounds |
| `electric` | `#6A36FF` | anything that needs the user: "needs your OK" tags, the big number block, focus rings, active slide outline |
| `cream` | `#F4F0E9` | text (dark), primary pill buttons (dark), page background (light) |
| `pink` | `#F12056` | only inside the hero ribbon glow |
| `lavender` | `#8E7BFF` (with alpha) | subtle tints, hashtags |

Electric violet sits next to carephoto's own violet `#6C3CE1`, and the pink/violet glow echoes carephoto's chat screen: that is the family resemblance.

**Light mode** = jolt's cream canvas: `cream` background, `ink` text, white cards with hairline borders, `ink` pill buttons. **Dark is the default**; a jolt-style toggle switches modes; the choice is remembered per viewer (cookie, so the server renders the right mode with no flash).

**Type**
- Headlines: extra-wide, uppercase, mixing light (300) and extra-bold (800) in one line, e.g. "GOOD MORNING, **MERT.**". jolt uses Owners Wide (paid Adobe font); we use **Archivo at width 125%** (Google, via `next/font`).
- Body: **General Sans** (free, Fontshare; self-host the woff2 files), relaxed line-height, large lede text (~20px).
- Numbers and numbered lists (`01.` `02.`) and big results figures use the wide face, extra-bold.

**Components**
- Pill buttons, radius 100px, with a `↳` arrow on primary actions ("Review posts ↳", "Approve ↳").
- Section cards: radius 10px, `violet`, a header row (small label + wide uppercase title) separated by a hairline, then a body; optionally an `electric` block on the left holding a big glyph or number.
- Hairline rules (1px cream at ~50% on dark) between sections and above each calendar day.
- Tags as small pills; status always as plain words.
- Small radius (5px) on image tiles.
- A closing line at the bottom of the home page in giant wide type: "POST **WITH CARE.**"

**The grain ribbon (signature background)**
At the top of each page, a blurred pink + violet light ribbon (two large rotated ellipses with thick coloured borders, heavy `filter: blur`) over `ink`, overlaid with film grain. The grain uses the same technique as the worker's `apps/worker/src/lib/gradient.ts`: a pre-rendered 240px noise PNG tile (random black/white/transparent pixels, density 0.45, seed 7), applied twice (240px and 800px tiles) with `mix-blend-mode: overlay` at ~0.34 / ~0.18 opacity on dark and ~0.16 / ~0.09 on light. Ship the tile as a static asset (generate once; do not render it per request). The ribbon is decorative, `pointer-events: none`, and sits behind content.

**Carephoto halo:** a small "by carephoto" in the footer. Nothing more.

**Words:** plain sentences everywhere. Status labels: "Needs your OK", "Scheduled", "Posted", "Skipped", "Didn't go out" (failed/expired), "Rest day" (no post that day), "Reworking…". The agent is called "the agent" or "Carepost", never "AI model" or "run".

## 5. Screens

### 5.1 Navigation (all screens)
Top bar: wordmark **CARE**POST (heavy/light), tabs **Home · Calendar · Brand · Results** (uppercase, active one underlined), and on the right the **brand switcher** pill showing the current brand ("carephoto ▾"). The switcher lists the brands the user is a member of; picking one keeps the same tab. With one brand, the pill shows the name without a menu. Routes are brand-scoped, e.g. `/b/[slug]` (home), `/b/[slug]/calendar`, `/b/[slug]/brand`, `/b/[slug]/results`, with the post view as `/b/[slug]/posts/[id]` (rendered as an overlay over the page that opened it, and as a full page on direct load). The signed-in root `/` sends users with one brand straight to it and shows a simple brand list otherwise. On phones the tabs move to a bottom bar.

### 5.2 Home (layout was locked in sub-project 1's brainstorm, now in this visual language)
1. Grain ribbon, then "GOOD MORNING, **{FIRST NAME}.**" (time-of-day greeting in the brand's timezone; first name from the user's email/profile, fallback "there"), and a lede: "Your Instagram is planned for the week. N posts are waiting for your OK; nothing goes out without it."
2. **Needs-you card** (review mode, only when something is waiting): label "Needs you", title "N POSTS TO REVIEW", electric block with the big number, a sentence naming when the first one goes out ("The first one goes out **Tuesday at 10:00**"), a numbered list of the waiting posts (day + a short title), and "Review posts ↳" which opens the first waiting post in the post view; its arrows step through the rest. Posts that need a new time are listed first and lead the sentence ("One post needs a new time."). Autopilot brands see this card only for posts back from a redo or needing a new time, with the lede "A post you asked to redo is back and needs your OK." (final-review ruling).
3. **This week:** "THIS **WEEK**" with ‹ › to move between weeks, Mon–Sun grid. Each day: hairline rule, weekday + date (wide, bold), then a 4:5 thumbnail tile of that day's post with a status tag under it, or a dashed "Rest day" tile. A day with two posts shows both stacked (the agent may plan more than one). Clicking a tile opens the post view.
4. **Results strip:** three big wide numbers for last week (people reached, change vs the week before, best post), linking to Results.
5. Closing line "POST **WITH CARE.**" and the footer halo.

Empty and edge states: brand paused ("Carepost is paused for this brand. Nothing will be planned or posted."), no posts yet this week ("Your first plan arrives Sunday morning."), autopilot (tags say "Scheduled").

### 5.3 Post view
Large overlay panel (full screen on phones). Header: "{WEEKDAY} **POST**", "‹ 1 of 3 ›" when stepping through waiting posts, Close.

**Left half, two parts:**
- *How it looks on Instagram:* a phone-style frame with the brand's handle and avatar (brand logo), the current slide, carousel dots, and the caption truncated after two lines with "…more", as followers will see it.
- *All slides, in order:* the full carousel as a numbered contact sheet (`01.`–`NN.`), drag to reorder, ✕ to remove a slide, and a final tile "+ Add a product photo" that picks from the brand's `brand_assets` of kind `product`. A carousel must keep at least 1 slide and at most Instagram's maximum (10).

**Right half:**
- *Goes out:* "TUE 20 · 10:00" (wide) + a format chip ("Carousel · 5 photos" / "Single photo"), and "Change time" (date + time picker, brand timezone, not in the past).
- *Caption, click to edit:* the caption and hashtags edited in place; autosaves (debounced) with a quiet "Saved ✓"; a soft warning near Instagram's 2,200-character caption limit.
- *Why this post:* the post's `rationale`, as one or two sentences.
- *Not quite right? Ask the agent:* a free-text box ("e.g. 'more playful, and use the rose oil photo'") with **Redo ↳**, plus quick picks: "Shorter caption", "Different photos", "More playful", "More professional" (each sends that phrase as the feedback; they can be combined with typed text).
- *Actions:* **Approve ↳** (primary), "Save & decide later", and a quiet "Skip this post" link (skip = reject).

**By status:**
- Needs your OK: everything above.
- Approved / scheduled: still editable until it goes out; Approve becomes "Approved ✓" with an "Undo" back to needs-your-OK (review mode). An edit by an owner or editor **keeps it approved** (anyone who can edit can approve, so their edit counts as their OK); the post shows "Last changed by {name}, {when}" so a co-owner can see it moved. (My call; the user didn't pick, so flag it.)
- Approved but the brand has **no publisher connected** (all launch brands until sub-project 2, including carephoto today): label "Ready · not connected to Instagram yet". These posts must **not** be expired by `expireMissedApprovedPosts` (parked item from the foundation rulings, resolved here); once their time has passed they show "Ready · wasn't posted (Instagram not connected)" and stay out of the way. The home lede says "nothing goes out until Instagram is connected" for such brands.
- Publishing / posted: read-only. The right column shows the post's results (reach, saves, shares, likes, comments) instead of the editing tools, plus "View on Instagram" when `external_post_id` allows building a link.
- Skipped / didn't go out: read-only with the reason in plain words.
- Autopilot brands: same panel; the actions are "Keep" (no-op) and "Pull this post" (reject); editing works the same.
- Viewer role: everything read-only, no actions.

**What a redo may do (decided by the user):** everything the agent can do when drafting: rewrite the caption and hashtags, reorder/swap slides, use the brand's product photos, re-render text slides, **and generate new images** through the carephoto Agent API (including product photos as reference images). New images depend on the carephoto Agent API being live in production (PR yigitokar/lula#678); until then a redo works without generating images and the UI does not promise new images. Image generation makes a redo slower (plan for 3–5 minutes; the "Reworking…" estimate should reflect whether images are being generated) and costs carephoto credits on Carepost's hosted key, so redos are a **usage item for billing (sub-project 5)**: plans include a number of image redos, with more as an upgrade or paid extra. Until billing exists, the per-post limit below caps cost.

**Redo state rules (my calls, from the builder check):**
- Asking for a redo puts the post in a distinct **reworking** state (a new status value or a flag; builder's choice) that `claimDuePosts`, `expirePendingPosts` and `expireMissedApprovedPosts` all skip, so the old version can never go out mid-redo and a queued redo is never expired under it.
- While reworking, the post is **locked**: no approve, edit, time change or second redo (the post view shows the "Reworking…" state with the feedback that was sent).
- A redo is **not offered within 30 minutes of the posting time** ("Too close to posting time to rework. Edit it yourself or skip it.").
- If the redo finishes after the posting time has passed, the post comes back as needs-your-OK with "The planned time has passed. Pick a new time." and the time picker opened.
- Redos get their own worker lane or priority so they never wait behind a long weekly plan (builder decides the mechanism; the user is waiting on the result).

**Redo flow:**
1. The user sends feedback. The post enters the "Reworking…" state; the tile on the week shows the post dimmed with "Reworking: 'more playful'… about 2 minutes". The user can close the page.
2. The worker reworks *that one post* (caption and/or slides, per the feedback), keeping its date and time unless the feedback asks otherwise.
3. The post returns as "New version · needs your OK" (also in autopilot, a redo always comes back for review, since the user asked for a change).
4. "Previous version" is one click away in the post view, and the user can switch back. A redo never loses something the user liked.
5. A redo that fails restores the previous version and says "The agent couldn't rework this one. Your post is unchanged."
6. Limit: 3 redos per post (configurable). After that: "You've used the redos for this post. Edit it yourself or skip it."

### 5.4 Calendar
The home week grid extended to a month view (‹ month ›), same tiles at a smaller size, same status tags, same click-to-open. Phones get the vertical day list. No drag-and-drop between days in this sub-project ("Change time" in the post view covers moving a post).

### 5.5 Results
Answers "is this working?" in plain words.
1. **Three big numbers, last 30 days,** each with the change vs the previous 30 days: *people reached*, *saves & shares*, *new followers*. New followers needs account-level Instagram data that doesn't exist yet (sub-project 2): until then, show the first two only and keep the third slot as "Followers appear once Instagram is connected".
2. **Your best posts:** top 3 by reach (ties broken by saves) in the window, as large thumbnails with their numbers and one line of why it worked (from the post's rationale/format/day).
3. **What the agent learned:** 2–3 plain sentences written by the agent during its weekly planning run, stored explicitly (not parsed from logs). If none exist yet, hide the section.
4. **One trend line:** weekly reach over the last 13 weeks. The only chart on the page.
Empty state for new brands: "Your results appear here once your first posts go out."

### 5.6 Brand (placeholder)
A simple page in the same style showing the brand's name, logo, timezone, posting days, and approval mode, read-only, with "Brand setup is coming soon". The real page is sub-project 4.

### 5.7 Login
Restyle the existing magic-link login in the same language (grain ribbon, wide headline "SIGN **IN.**", one email field, a pill button, a clear "Check your email" state). Behaviour unchanged. (Google sign-in is wanted later, not in this sub-project.)

### 5.8 Phone
Same language at 390px width with a 16px gutter: tabs at the bottom, the week as a vertical list of days (each day a row with the tile and tag), the post view full screen with the Instagram preview first, then the slides as a horizontal strip, then the right-hand column stacked below.

## 6. Backend changes needed

**Write RPCs (new migration),** all `SECURITY DEFINER`, `search_path` pinned, each checking `auth.uid()` is an `owner`/`editor` member of the post's brand and that the post is in an editable status, returning a clear error otherwise:
- approve, un-approve (back to needs-your-OK), skip/pull (reject);
- update caption + hashtags;
- change planned time (brand timezone handled in the web layer; store UTC; reject past times);
- update slides (reorder/remove/add a product asset), validating every path belongs to the brand;
- request a redo (records feedback, enforces the per-post limit, enqueues the job);
- restore the previous version.
Keep the existing duplicate/date guards meaningful: changing a post's time must not create two core posts on one local date if that invariant still matters to the worker (builder to check against `save_post`'s guards).

**Redo jobs:** a new `agent_runs` kind (e.g. `revise`) with the target post id and feedback text, processed by the worker's run loop (unlike `manual`, it is user-initiated from the web and must be picked up by the worker). The agent gets the post, its slides, the feedback, and the brand context, and saves the result over that post through a dedicated path, not through `save_post`'s "new post" guards. Respect paused brands (no redo for a paused brand; the UI says why).

**Versions (my call, from the builder check):** keep a snapshot of a post (caption, hashtags, media, planned time) **before every redo and before every restore**, including whatever the user had edited by then, so nothing they made is lost. The post view offers a simple history: "Previous version" flips back, and the version list (newest first, each with "Version from {when}, before redo: '{feedback}'") lets them restore any earlier one. Restoring snapshots the current version first, so it can be flipped back again. A small `post_versions` table is the suggested shape. Ordinary caption autosaves are not versions.

**Product photos in slides:** product photos live in the `brand-assets` bucket, but publishing signs URLs from `post-media`. When a product photo is added to a post, copy it into the post's `post-media` folder (or teach publishing to sign from both buckets). Builder's choice; copying is simpler for publishing.

**Agent learnings:** the weekly plan run writes 2–3 plain-language learnings for the brand into a dedicated place (e.g. a `brand_insights` table with week + text). This touches the agent's instructions: add the request without weakening the existing creative guidance.

**Old carephoto images:** the 62 imported carephoto posts have no images (the old system only kept local temp paths). Upload the 28 that still exist on disk as each post's first slide (first slide only for carousels; 2 posts share one overwritten file, so skip that file). The rest stay imageless until Instagram import (sub-project 2) can fetch the real media. Tiles without an image show a quiet placeholder with the caption's first words.

## 7. Decided by the user (in conversation)
- jolt.digital-inspired visual language, dark + cream light mode (mockups approved: "love ittttttt").
- Home layout: greeting + needs-you card + Mon–Sun week with thumbnails + last-week results (from sub-project 1).
- Post view: Instagram preview + all slides on the left; when, caption, why, ask-the-agent, actions on the right.
- Both fixing it yourself (caption, time, slides) and asking the agent to redo.
- A redo may generate new images through carephoto (once the Agent API is live); the user sees redos as a revenue lever, so they become a billed usage item in sub-project 5.
- Results: plain-language "is it working" page (the user asked for my proposal and accepted it by asking me to write this up).

## 8. My calls (flagged for review)
- Dark is the default mode; toggle remembered per viewer.
- Archivo 125% as the free stand-in for Owners Wide; General Sans self-hosted.
- Approved posts stay editable until they go out; posted posts become read-only with results.
- A redo always returns for review, even in autopilot.
- Redo limit 3 per post (until billing defines plan allowances).
- An owner/editor's edit keeps an approved post approved, with a "last changed by" note.
- Reworking posts are locked and never published or expired mid-redo; no redo within 30 minutes of posting time.
- Brands without a publisher: "Ready · not connected to Instagram yet", and their approved posts are no longer auto-expired.
- Version history: snapshots before every redo and restore, restorable from a list.
- Autopilot actions are "Keep" / "Pull this post".
- Calendar is a month view without drag-and-drop.
- Results numbers use 30-day windows; best posts ranked by reach then saves.
- Route shape `/b/[slug]/…`.
- Brand page is a read-only placeholder.
- Old carephoto images: upload the 28 survivors now; the rest wait for Instagram import.

## 9. Left to the builder
Component structure; data fetching and caching; how the overlay and direct-load routes share code; polling vs realtime for the "Reworking…" state (polling every ~10s while a redo is in flight is fine); exact animation (subtle, respect `prefers-reduced-motion`); accessibility details (contrast of cream on violet passes AA; focus rings in electric violet; keyboard: arrows step between posts, Esc closes); test strategy (unit tests for formatting/state mapping and RPC permission tests in PGlite, plus a visual check of each screen in both modes at desktop and phone widths).

## 10. References
- Mockups (local, gitignored): `~/GitHub/marketing-agent/.superpowers/brainstorm/98493-1792325158/content/`: `jolt-direction.html` (home, dark + light), `post-detail-v2.html` (post view + redo states). Earlier rejected directions: `visual-direction.html`, `visual-direction-v2.html`.
- jolt.digital research (screenshots + CSS): `/private/tmp/claude-501/-Users-mertokar-GitHub-marketing-agent/55a54aa4-17b2-41c3-8247-08ee7a2bbffa/scratchpad/jolt/` (temporary).
- Locked home layout from sub-project 1: `~/GitHub/marketing-agent/.superpowers/brainstorm/56623-1792237342/content/home-screen-v2.html`.
- Grain technique: `apps/worker/src/lib/gradient.ts`.
