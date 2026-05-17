import fs from "fs";
import path from "path";
import sharp from "sharp";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

interface SchedulePostInput {
  caption: string;
  hashtags: string[];
  images: string[];
  scheduledTime?: string;
}

export interface SchedulePostResult {
  ok: boolean;
  message: string;
  postizId?: string;
  groupId?: string;
}

interface PostizMedia {
  id: string;
  path: string;
}

interface PostizIntegration {
  id: string;
  identifier: string;
  name: string;
}

async function postizFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const apiKey = process.env.POSTIZ_API_KEY!;
  const baseUrl =
    process.env.POSTIZ_BASE_URL ?? "https://app.postiz.com/api/public/v1";

  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
      ...options.headers,
    },
  });
}

async function getInstagramIntegrationId(): Promise<string> {
  const res = await postizFetch("/integrations");
  if (!res.ok) {
    throw new Error(`Failed to list integrations (${res.status}): ${await res.text()}`);
  }

  const integrations = (await res.json()) as PostizIntegration[];
  const instagram = integrations.find((i) => i.identifier === "instagram");
  if (!instagram) {
    throw new Error(
      "No Instagram integration found in Postiz. Connect Instagram first."
    );
  }
  return instagram.id;
}

async function uploadImageFromUrl(url: string): Promise<PostizMedia> {
  const res = await postizFetch("/upload-from-url", {
    method: "POST",
    body: JSON.stringify({ url }),
  });

  if (!res.ok) {
    throw new Error(`Failed to upload image (${res.status}): ${await res.text()}`);
  }

  return (await res.json()) as PostizMedia;
}

// Public-CDN fallback: when our Cloudflare tunnel has had recent flakes, Meta's
// URL validator cools down on the host and refuses media-container creation
// with a generic 2207052 error. Uploading to a neutral public CDN bypasses
// the problem entirely.
//
// 2026-04-27: catbox.moe started returning successful upload URLs whose files
// are 0 bytes when fetched (intake works, storage broken). We now verify the
// stored size and fall through to tmpfiles.org if catbox returns an empty
// file. tmpfiles has a ~60-min TTL which is fine because Postiz's
// /upload-from-url re-fetches the file once at schedule time; the URL only
// needs to be live until then.
async function fetchSize(url: string): Promise<number> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { method: "GET", signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return 0;
    const buf = await res.arrayBuffer();
    return buf.byteLength;
  } catch {
    return 0;
  }
}

async function uploadToTmpfiles(filePath: string, mime: string): Promise<string> {
  const bytes = fs.readFileSync(filePath);
  const blob = new Blob([new Uint8Array(bytes)], { type: mime });
  const form = new FormData();
  form.append("file", blob, path.basename(filePath));
  const res = await fetch("https://tmpfiles.org/api/v1/upload", {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`tmpfiles ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data?: { url?: string } };
  const viewer = json?.data?.url;
  if (!viewer) throw new Error(`tmpfiles bad response: ${JSON.stringify(json)}`);
  // tmpfiles returns a viewer URL; the direct-download form swaps the host
  // path prefix and is what Meta/Postiz can actually fetch as an image.
  const direct = viewer.replace(/^http:\/\//, "https://").replace("/tmpfiles.org/", "/tmpfiles.org/dl/");
  return direct;
}

async function uploadToCatbox(filePath: string): Promise<string> {
  const bytes = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === ".jpg" || ext === ".jpeg"
      ? "image/jpeg"
      : ext === ".webp"
        ? "image/webp"
        : "image/png";
  const blob = new Blob([new Uint8Array(bytes)], { type: mime });
  const form = new FormData();
  form.append("reqtype", "fileupload");
  form.append("fileToUpload", blob, path.basename(filePath));
  const res = await fetch("https://catbox.moe/user/api.php", {
    method: "POST",
    body: form,
  });
  if (res.ok) {
    const url = (await res.text()).trim();
    if (url.startsWith("http")) {
      const size = await fetchSize(url);
      if (size > 0) return url;
      console.warn(
        `[schedule-post] catbox returned ${url} but the file is 0 bytes — falling through to tmpfiles`
      );
    } else {
      console.warn(`[schedule-post] catbox bad response: ${url} — falling through to tmpfiles`);
    }
  } else {
    console.warn(`[schedule-post] catbox ${res.status} — falling through to tmpfiles`);
  }
  return uploadToTmpfiles(filePath, mime);
}

// Check whether the Cloudflare tunnel is in good shape to host media that
// Meta's servers will fetch. Two signals:
//   1. Live HEAD probe — the tunnel is actually up right now
//   2. cloudflared log scan — no QUIC/datagram flakes in the last 90 min
//      (Meta caches a "host health" score; recent flakes poison that score
//      for a cooldown window, so even a currently-up tunnel may be blocked.)
// Falling through to "healthy" on check errors (docker unavailable, etc.) so
// the check never blocks posting by itself.
async function isTunnelHealthy(): Promise<{ healthy: boolean; reason: string }> {
  const tunnelUrl = process.env.POSTIZ_TUNNEL_URL;
  if (!tunnelUrl) return { healthy: false, reason: "POSTIZ_TUNNEL_URL not set" };

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${tunnelUrl}/robots.txt`, {
      method: "GET",
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.status >= 500) {
      return { healthy: false, reason: `tunnel probe returned ${res.status}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { healthy: false, reason: `tunnel probe failed: ${msg}` };
  }

  try {
    const { stdout } = await execFileAsync(
      "docker",
      ["logs", "postiz-tunnel", "--since", "90m"],
      { maxBuffer: 8 * 1024 * 1024 }
    );
    const stderr = stdout; // cloudflared writes errors to stdout too
    if (/timeout: no recent network activity|ended abruptly|Connection terminated/.test(stderr)) {
      return {
        healthy: false,
        reason: "cloudflared had connection flakes in the last 90 min",
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[tunnel-health] docker log check skipped: ${msg}`);
  }

  // Meta host-health cooldown signal: even when cloudflared is quiet now, Meta
  // may still be blacklisting postiz.mertokar.com from an earlier flake window.
  // 2026-04-25: observed a fresh 2207052 ~40h after the previous batch — Meta's
  // cooldown can clearly outlast 24h, so we widen the lookback to 72h. If ANY
  // post in the last 72h errored with code 9004 / subcode 2207052 ("Only photo
  // or video can be accepted"), treat the domain as contaminated and route
  // through catbox until the cooldown clears. Queries Postgres directly (via
  // docker exec) so soft-deleted rows still count — a user deleting an ERROR
  // post means "move on from this attempt", not "Meta's cooldown is gone".
  try {
    const sql = `SELECT COUNT(*) FROM "Post" WHERE state='ERROR' AND error LIKE '%2207052%' AND "updatedAt" > NOW() - INTERVAL '72 hours';`;
    const { stdout } = await execFileAsync(
      "docker",
      ["exec", "postiz-db", "psql", "-U", "postiz", "-d", "postiz", "-tAc", sql],
      { maxBuffer: 1024 * 1024 }
    );
    const count = parseInt(stdout.trim(), 10);
    if (Number.isFinite(count) && count > 0) {
      return {
        healthy: false,
        reason: `Meta rejected ${count} post${count === 1 ? "" : "s"} with 2207052 in the last 72h — host reputation is cooling down`,
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[tunnel-health] Postiz error-history check skipped: ${msg}`);
  }

  return { healthy: true, reason: "ok" };
}

async function uploadImageFile(filePath: string): Promise<PostizMedia> {
  const apiKey = process.env.POSTIZ_API_KEY!;
  const baseUrl =
    process.env.POSTIZ_BASE_URL ?? "https://app.postiz.com/api/public/v1";

  // Re-encode to JPEG before upload. Instagram's Graph API carousel fetcher
  // intermittently rejects PNG inputs with "Only photo or video can be
  // accepted as media type" (code 9004 / subcode 2207052). JPEG is the
  // officially-supported format; flattening onto white avoids surprises from
  // alpha channels. See: developers.facebook.com/docs/instagram-platform/...
  const ext = path.extname(filePath).toLowerCase();
  const srcBuffer = fs.readFileSync(filePath);
  const jpegBuffer =
    ext === ".jpg" || ext === ".jpeg"
      ? srcBuffer
      : await sharp(srcBuffer)
          .flatten({ background: "#ffffff" })
          // Baseline (non-progressive) JPEG — Instagram's Graph API carousel
          // ingester chokes on progressive encoding, returning the generic
          // "Only photo or video can be accepted" error on random slides.
          // mozjpeg enables progressive by default, so don't use it.
          .jpeg({ quality: 92, progressive: false, chromaSubsampling: "4:2:0" })
          .toBuffer();
  const fileName = path.basename(filePath, ext) + ".jpg";
  const blob = new Blob([new Uint8Array(jpegBuffer)], { type: "image/jpeg" });

  const form = new FormData();
  form.append("file", blob, fileName);

  const res = await fetch(`${baseUrl}/upload`, {
    method: "POST",
    headers: { Authorization: apiKey },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Failed to upload file (${res.status}): ${await res.text()}`);
  }

  return (await res.json()) as PostizMedia;
}

function isLocalPath(source: string): boolean {
  return !source.startsWith("http://") && !source.startsWith("https://");
}

export async function schedulePost(input: SchedulePostInput): Promise<SchedulePostResult> {
  const apiKey = process.env.POSTIZ_API_KEY;

  if (!apiKey) {
    return {
      ok: false,
      message: "Postiz API key not configured. Post saved to content calendar but not scheduled.",
    };
  }

  try {
    // 1. Get Instagram integration ID
    const integrationId = await getInstagramIntegrationId();

    // 2. Upload all images — local files go via multipart, URLs via upload-from-url
    //    For URLs: keep the original public URL as path (self-hosted Postiz returns localhost paths)
    //    For files: Postiz path is rewritten to the tunnel URL so Instagram can reach it
    //    If the tunnel is unhealthy (recent flakes / Meta host-rep cooldown),
    //    fall back to uploading the local file to catbox and handing that public
    //    URL to Meta — which it trusts unconditionally.
    const tunnelUrl = process.env.POSTIZ_TUNNEL_URL;
    const health = await isTunnelHealthy();
    if (!health.healthy) {
      console.warn(
        `[schedule-post] tunnel unhealthy (${health.reason}) — uploading local files via catbox fallback`
      );
    }
    const mediaItems: Array<{ id: string; path: string }> = [];
    for (const imageSource of input.images) {
      if (isLocalPath(imageSource)) {
        if (!health.healthy) {
          const catboxUrl = await uploadToCatbox(imageSource);
          const media = await uploadImageFromUrl(catboxUrl);
          mediaItems.push({ id: media.id, path: catboxUrl });
        } else {
          const media = await uploadImageFile(imageSource);
          // Rewrite localhost path to tunnel URL for Instagram access
          const publicPath = tunnelUrl
            ? media.path.replace(/http:\/\/localhost:\d+/, tunnelUrl)
            : media.path;
          mediaItems.push({ id: media.id, path: publicPath });
        }
      } else {
        const media = await uploadImageFromUrl(imageSource);
        mediaItems.push({ id: media.id, path: imageSource });
      }
    }

    // 3. Build caption with hashtags
    const fullCaption =
      input.caption +
      (input.hashtags.length > 0 ? "\n\n" + input.hashtags.join(" ") : "");

    // 4. Create post with Postiz's expected format.
    //    Clamp past times to now+5min so a stale/past schedule never publishes
    //    instantly or silently drops — the agent doesn't always know the clock.
    const nowMs = Date.now();
    const requested = input.scheduledTime ? new Date(input.scheduledTime).getTime() : nowMs;
    const minFutureMs = nowMs + 5 * 60 * 1000;
    const clamped = Number.isFinite(requested) && requested < minFutureMs;
    if (clamped) {
      console.warn(
        `[schedule-post] requested time ${input.scheduledTime} is in the past; clamping to ${new Date(minFutureMs).toISOString()}`
      );
    }
    const postDate = clamped ? new Date(minFutureMs).toISOString() : new Date(requested).toISOString();
    const body = {
      type: input.scheduledTime ? "schedule" : "now",
      date: postDate,
      shortLink: false,
      tags: [],
      posts: [
        {
          integration: { id: integrationId },
          value: [
            {
              content: fullCaption,
              image: mediaItems,
            },
          ],
          settings: { post_type: "post" },
        },
      ],
    };

    const res = await postizFetch("/posts", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return {
        ok: false,
        message: `Failed to schedule post via Postiz (${res.status}): ${errorText}`,
      };
    }

    // Postiz responds with the group + an array of per-platform post ids. We
    // resolve the actual Postiz post id by querying the list endpoint around
    // the scheduled timestamp and matching on integration + group.
    const data = (await res.json()) as {
      id?: string;
      group?: string;
      posts?: Array<{ id: string }>;
    };
    const groupId = data.group ?? data.id;
    let postizId = data.posts?.[0]?.id ?? data.id;

    if (!postizId && groupId) {
      postizId = await lookupPostIdByGroup(groupId, postDate, integrationId);
    }

    const postType = mediaItems.length > 1 ? "carousel" : "post";
    return {
      ok: true,
      message: `Post scheduled successfully via Postiz. ID: ${postizId ?? "unknown"}, Type: ${body.type}, Images: ${mediaItems.length}, PostType: ${postType}`,
      postizId,
      groupId,
    };
  } catch (error) {
    return {
      ok: false,
      message: `Failed to schedule post: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// Postiz's POST /posts returns a group id + array of per-platform posts; some
// self-hosted versions respond without the per-post id. Fall back to a list
// query in a ±10-minute window around the scheduled time.
async function lookupPostIdByGroup(
  groupId: string,
  scheduledIso: string,
  integrationId: string
): Promise<string | undefined> {
  const d = new Date(scheduledIso);
  const startDate = new Date(d.getTime() - 10 * 60 * 1000).toISOString().slice(0, 10);
  const endDate = new Date(d.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  try {
    const res = await postizFetch(`/posts?startDate=${startDate}&endDate=${endDate}`);
    if (!res.ok) return undefined;
    const body = (await res.json()) as {
      posts?: Array<{ id: string; group?: string; integration?: { id?: string } }>;
    };
    const match = body.posts?.find(
      (p) => p.group === groupId && p.integration?.id === integrationId
    );
    return match?.id;
  } catch {
    return undefined;
  }
}
