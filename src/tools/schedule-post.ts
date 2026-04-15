interface SchedulePostInput {
  caption: string;
  hashtags: string[];
  images: string[];
  scheduledTime?: string;
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

export async function schedulePost(input: SchedulePostInput): Promise<string> {
  const apiKey = process.env.POSTIZ_API_KEY;

  if (!apiKey) {
    return "Postiz API key not configured. Post saved to content calendar but not scheduled.";
  }

  try {
    // 1. Get Instagram integration ID
    const integrationId = await getInstagramIntegrationId();

    // 2. Upload all images (registers with Postiz) and keep the original public URLs
    //    for Instagram — self-hosted Postiz returns localhost paths that Instagram can't reach
    const mediaItems: Array<{ id: string; path: string }> = [];
    for (const imageUrl of input.images) {
      const media = await uploadImageFromUrl(imageUrl);
      mediaItems.push({ id: media.id, path: imageUrl });
    }

    // 3. Build caption with hashtags
    const fullCaption =
      input.caption +
      (input.hashtags.length > 0 ? "\n\n" + input.hashtags.join(" ") : "");

    // 4. Create post with Postiz's expected format
    const postDate = input.scheduledTime ?? new Date().toISOString();
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
          settings: { post_type: mediaItems.length > 1 ? "carousel" : "post" },
        },
      ],
    };

    const res = await postizFetch("/posts", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return `Failed to schedule post via Postiz (${res.status}): ${errorText}`;
    }

    const data = (await res.json()) as { id?: string };
    const postType = mediaItems.length > 1 ? "carousel" : "post";
    return `Post scheduled successfully via Postiz. ID: ${data.id ?? "unknown"}, Type: ${body.type}, Images: ${mediaItems.length}, PostType: ${postType}`;
  } catch (error) {
    return `Failed to schedule post: ${error instanceof Error ? error.message : String(error)}`;
  }
}
