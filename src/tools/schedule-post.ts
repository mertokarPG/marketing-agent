interface SchedulePostInput {
  caption: string;
  hashtags: string[];
  imageUrl: string;
  scheduledTime?: string;
}

export async function schedulePost(input: SchedulePostInput): Promise<string> {
  const apiKey = process.env.POSTIZ_API_KEY;
  const baseUrl =
    process.env.POSTIZ_BASE_URL ?? "https://app.postiz.com/api/v1";

  if (!apiKey) {
    return "Postiz API key not configured. Post saved to content calendar but not scheduled.";
  }

  try {
    const fullCaption =
      input.caption +
      (input.hashtags.length > 0 ? "\n\n" + input.hashtags.join(" ") : "");

    const body: Record<string, unknown> = {
      content: fullCaption,
      media: [{ url: input.imageUrl }],
      platform: "instagram",
    };

    if (input.scheduledTime) {
      body.scheduledAt = input.scheduledTime;
    }

    const response = await fetch(`${baseUrl}/posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return `Failed to schedule post via Postiz (${response.status}): ${errorText}`;
    }

    const data = (await response.json()) as { id?: string; status?: string };
    return `Post scheduled successfully via Postiz. ID: ${data.id ?? "unknown"}, Status: ${data.status ?? "unknown"}`;
  } catch (error) {
    return `Failed to schedule post: ${error instanceof Error ? error.message : String(error)}`;
  }
}
