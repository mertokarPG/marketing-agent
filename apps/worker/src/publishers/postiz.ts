import { schedulePost } from "../tools/schedule-post.js";
import { ingestAnalytics } from "../tools/ingest-analytics.js";
import type { Publisher } from "./types.js";

export function postizPublisher(): Publisher {
  return {
    name: "postiz",
    async publish(post) {
      // The single shared Postiz account belongs to carephoto; never publish another brand through it.
      const allowed = process.env.POSTIZ_BRAND_ID;
      if (!allowed || post.brandId !== allowed) {
        throw new Error(`Postiz account is not configured for brand ${post.brandId} (POSTIZ_BRAND_ID ${allowed ? "mismatch" : "unset"}); refusing to publish`);
      }
      // No scheduledTime → Postiz posts now. The publish loop only hands over posts that are due.
      const r = await schedulePost({ caption: post.caption, hashtags: post.hashtags, images: post.mediaUrls });
      if (!r.ok) throw new Error(r.message);
      return { externalId: r.postizId ?? r.groupId ?? "" };
    },
    async ingestMetrics(brand, db) {
      await ingestAnalytics(brand, db);
    },
  };
}
