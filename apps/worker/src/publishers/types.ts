import type { BrandConfig, Db } from "@carepost/core";

export interface PublishablePost { id: string; brandId: string; caption: string; hashtags: string[]; mediaUrls: string[] }

export interface Publisher {
  name: "postiz";
  publish(post: PublishablePost): Promise<{ externalId: string }>;
  ingestMetrics?(brand: BrandConfig, db: Db): Promise<void>;
}
