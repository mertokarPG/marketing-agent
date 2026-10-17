import { schedulePost } from "../tools/schedule-post.js";
import { ingestAnalytics } from "../tools/ingest-analytics.js";
import type { Publisher } from "./types.js";

/** The single shared Postiz account belongs to carephoto; never publish or read metrics for another brand through it. */
function assertPostizBrand(brandId: string, action: string): void {
  const allowed = process.env.POSTIZ_BRAND_ID;
  if (!allowed || brandId !== allowed) {
    throw new Error(`Postiz account is not configured for brand ${brandId} (POSTIZ_BRAND_ID ${allowed ? "mismatch" : "unset"}); refusing to ${action}`);
  }
}

export function postizPublisher(): Publisher {
  return {
    name: "postiz",
    async publish(post) {
      assertPostizBrand(post.brandId, "publish");
      // No scheduledTime → Postiz posts now. The publish loop only hands over posts that are due.
      const r = await schedulePost({ caption: post.caption, hashtags: post.hashtags, images: post.mediaUrls });
      if (!r.ok) throw new Error(r.message);
      return { externalId: r.postizId ?? r.groupId ?? "" };
    },
    async ingestMetrics(brand, db) {
      // The run loop treats ingest as best-effort: a refusal is logged as a warning and the run continues.
      assertPostizBrand(brand.dbId, "ingest metrics");
      await ingestAnalytics(brand, db);
    },
  };
}
