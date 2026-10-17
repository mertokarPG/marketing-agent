export const BUCKETS = { assets: "brand-assets", media: "post-media" } as const;

export interface StorageClient {
  download(bucket: string, path: string): Promise<Buffer>;
  upload(bucket: string, path: string, bytes: Buffer, contentType: string): Promise<void>;
  signedUrl(bucket: string, path: string, ttlSec: number): Promise<string>;
}

export class MemoryStorage implements StorageClient {
  files = new Map<string, { bytes: Buffer; contentType: string }>();
  signedCalls: { bucket: string; path: string; ttlSec: number }[] = [];
  failUploads = false;
  async download(bucket: string, path: string) {
    const f = this.files.get(`${bucket}/${path}`);
    if (!f) throw new Error(`object not found: ${bucket}/${path}`);
    return f.bytes;
  }
  async upload(bucket: string, path: string, bytes: Buffer, contentType: string) {
    if (this.failUploads) throw new Error("upload failed (test)");
    this.files.set(`${bucket}/${path}`, { bytes, contentType });
  }
  async signedUrl(bucket: string, path: string, ttlSec: number) {
    this.signedCalls.push({ bucket, path, ttlSec });
    return `memory://${bucket}/${path}?ttl=${ttlSec}`;
  }
}
