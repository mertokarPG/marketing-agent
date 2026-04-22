import fs from "fs";
import path from "path";

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

async function uploadImageFile(filePath: string): Promise<PostizMedia> {
  const apiKey = process.env.POSTIZ_API_KEY!;
  const baseUrl =
    process.env.POSTIZ_BASE_URL ?? "https://app.postiz.com/api/public/v1";

  const fileBuffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  const blob = new Blob([fileBuffer], { type: "image/png" });

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
    const tunnelUrl = process.env.POSTIZ_TUNNEL_URL;
    const mediaItems: Array<{ id: string; path: string }> = [];
    for (const imageSource of input.images) {
      if (isLocalPath(imageSource)) {
        const media = await uploadImageFile(imageSource);
        // Rewrite localhost path to tunnel URL for Instagram access
        const publicPath = tunnelUrl
          ? media.path.replace(/http:\/\/localhost:\d+/, tunnelUrl)
          : media.path;
        mediaItems.push({ id: media.id, path: publicPath });
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
