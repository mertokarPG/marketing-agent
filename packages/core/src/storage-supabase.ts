import { createClient } from "@supabase/supabase-js";
import type { StorageClient } from "./storage.js";

export function createSupabaseStorage(url: string, serviceRoleKey: string): StorageClient {
  const sb = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  return {
    async download(bucket, path) {
      const { data, error } = await sb.storage.from(bucket).download(path);
      if (error || !data) throw new Error(`storage download ${bucket}/${path}: ${error?.message ?? "no data"}`);
      return Buffer.from(await data.arrayBuffer());
    },
    async upload(bucket, path, bytes, contentType) {
      const { error } = await sb.storage.from(bucket).upload(path, bytes, { contentType, upsert: true });
      if (error) throw new Error(`storage upload ${bucket}/${path}: ${error.message}`);
    },
    async signedUrl(bucket, path, ttlSec) {
      const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, ttlSec);
      if (error || !data) throw new Error(`storage sign ${bucket}/${path}: ${error?.message ?? "no data"}`);
      return data.signedUrl;
    },
  };
}
