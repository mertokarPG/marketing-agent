import fs from "node:fs/promises";
import path from "node:path";
import {
  BUCKETS, assetLocalPath, brandConfigFromRow, getBrandById, listBrandAssets,
  type BrandConfig, type Db, type StorageClient,
} from "@carepost/core";

export async function materializeBrand(
  db: Db, storage: StorageClient, brandId: string, tmpRoot: string
): Promise<{ brand: BrandConfig; cleanup(): Promise<void> }> {
  const row = await getBrandById(db, brandId);
  if (!row) throw new Error(`brand not found: ${brandId}`);
  const assets = await listBrandAssets(db, brandId);
  const dir = await fs.mkdtemp(path.join(tmpRoot, `brand-${row.slug}-`));
  const cleanup = () => fs.rm(dir, { recursive: true, force: true });
  try {
    for (const a of assets) {
      const local = path.join(dir, assetLocalPath(a));
      await fs.mkdir(path.dirname(local), { recursive: true });
      await fs.writeFile(local, await storage.download(BUCKETS.assets, a.storage_path));
    }
    return { brand: brandConfigFromRow(row, assets, dir), cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}
