interface GenerateImageInput {
  prompt: string;
  aspectRatio: "1:1" | "4:5" | "9:16";
  style: string | null;
  model:
    | "nano-banana-2"
    | "nano-banana-pro"
    | "flux-lora"
    | "recraft"
    | "seedream-v5-lite"
    | "qwen-image-2-pro"
    | "gpt-image-2";
}

interface GenerateImageResponse {
  imageUrl: string;
  model: string;
  creditsUsed: number;
  estimatedUsdCost: number;
  width: number;
  height: number;
  generationId: string;
}

interface CarephotoErrorBody {
  code?: string;
  message?: string;
}

const DEFAULT_BASE_URL = "https://carephoto.art/api/v1/agent";

export async function generateImage(input: GenerateImageInput): Promise<string> {
  const apiKey = process.env.CAREPHOTO_API_KEY;
  if (!apiKey) {
    return "carephoto API key not configured (CAREPHOTO_API_KEY). Cannot generate image.";
  }

  const baseUrl = process.env.CAREPHOTO_BASE_URL ?? DEFAULT_BASE_URL;

  const body: Record<string, unknown> = {
    prompt: input.prompt,
    aspectRatio: input.aspectRatio,
    model: input.model,
  };
  if (input.style) body.style = input.style;

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return `carephoto generate failed: network error: ${err instanceof Error ? err.message : String(err)}`;
  }

  if (!res.ok) {
    let errBody: CarephotoErrorBody = {};
    try {
      errBody = (await res.json()) as CarephotoErrorBody;
    } catch {
      // non-JSON body — leave empty
    }
    const code = errBody.code ?? `http_${res.status}`;
    const msg = errBody.message ?? res.statusText;

    if (res.status === 429) {
      const retryAfter = res.headers.get("Retry-After");
      return `carephoto generate rate-limited (429). Retry after ${retryAfter ?? "?"}s. ${msg}`;
    }
    if (res.status === 402) {
      return `carephoto generate failed: out of credits (402 quota_exceeded). ${msg}`;
    }
    if (res.status === 422) {
      return `carephoto generate blocked by content filter (422). Credits refunded. Try a different prompt. ${msg}`;
    }
    return `carephoto generate failed: ${code} (${res.status}): ${msg}`;
  }

  const data = (await res.json()) as GenerateImageResponse;

  return [
    `Generated image: ${data.imageUrl}`,
    `Model: ${data.model} | ${data.width}×${data.height} | ${data.creditsUsed} credits ($${data.estimatedUsdCost.toFixed(3)})`,
    `Generation ID: ${data.generationId}`,
    ``,
    `Pass imageUrl into brand_image / photo_overlay / brand_carousel as the imageUrl, or to schedule_post images[] for an unbranded post.`,
  ].join("\n");
}
