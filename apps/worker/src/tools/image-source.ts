import dns from "node:dns/promises";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";

// Image inputs (save_post images[], brand_image imageUrl) are chosen by the LLM,
// which reads scraped web content. Treat them as untrusted: local reads are
// confined to allow-listed roots and URL fetches to public https hosts.

export type ImageExt = "png" | "jpg" | "webp";
export interface LoadedImage { bytes: Buffer; ext: ImageExt; contentType: string }
export interface ImageSourceDeps {
  lookup?: (host: string) => Promise<{ address: string; family: number }[]>;
  fetch?: typeof fetch;
}
export interface ImageSourceOptions {
  brandDir: string;
  deps?: ImageSourceDeps;
  maxBytes?: number;
  timeoutMs?: number;
}

export class ImageSourceError extends Error {}

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

const CONTENT_TYPES: Record<ImageExt, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

export function sniffImage(bytes: Buffer): ImageExt | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.length >= 12 && bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP") return "webp";
  return null;
}

// Separate lists: a single BlockList matches IPv4 addresses against IPv4-mapped
// IPv6 rules, which would block every IPv4 host once ::ffff:0:0/96 is listed.
const blockedV4 = new net.BlockList();
for (const [addr, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blockedV4.addSubnet(addr, prefix, "ipv4");
const blockedV6 = new net.BlockList();
for (const [addr, prefix] of [
  ["::", 128], ["::1", 128], ["::ffff:0:0", 96], ["64:ff9b::", 96], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
] as const) blockedV6.addSubnet(addr, prefix, "ipv6");

export function isBlockedAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return blockedV4.check(address, "ipv4");
  if (family === 6) return blockedV6.check(address, "ipv6");
  return true;
}

async function realRoots(brandDir: string): Promise<string[]> {
  const roots: string[] = [];
  for (const r of [path.resolve(brandDir), path.resolve("tmp")]) {
    try { roots.push(await fs.realpath(r)); } catch { /* root absent: nothing to allow under it */ }
  }
  return roots;
}

function finish(bytes: Buffer, label: string): LoadedImage {
  const ext = sniffImage(bytes);
  if (!ext) throw new ImageSourceError(`${label} is not a PNG, JPEG or WebP image`);
  return { bytes, ext, contentType: CONTENT_TYPES[ext] };
}

async function loadLocal(src: string, opts: ImageSourceOptions, maxBytes: number): Promise<LoadedImage> {
  let real: string;
  try {
    real = await fs.realpath(path.resolve(opts.brandDir, src));
  } catch {
    throw new ImageSourceError(`local image not found: ${src}`);
  }
  const roots = await realRoots(opts.brandDir);
  if (!roots.some((r) => real === r || real.startsWith(r + path.sep)))
    throw new ImageSourceError(`local image ${src} is outside the brand and render directories`);
  const stat = await fs.stat(real);
  if (!stat.isFile()) throw new ImageSourceError(`local image ${src} is not a file`);
  if (stat.size > maxBytes) throw new ImageSourceError(`local image ${src} exceeds ${maxBytes} bytes`);
  return finish(await fs.readFile(real), `local image ${src}`);
}

function raceAbort<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    p.then(resolve, reject);
  });
}

async function assertPublicHttps(url: URL, deps: ImageSourceDeps, signal: AbortSignal): Promise<void> {
  if (url.protocol !== "https:") throw new ImageSourceError(`only https image URLs are allowed (got ${url.protocol})`);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(host)
    ? [host]
    : await raceAbort((deps.lookup ?? ((h: string) => dns.lookup(h, { all: true })))(host), signal)
        .then((r) => r.map((a) => a.address))
        .catch(() => { throw new ImageSourceError(`cannot resolve image host ${host}`); });
  if (addresses.length === 0 || addresses.some(isBlockedAddress))
    throw new ImageSourceError(`image host ${host} resolves to a non-public address`);
}

async function readCapped(res: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new ImageSourceError(`image exceeds ${maxBytes} bytes`);
  if (!res.body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ImageSourceError(`image exceeds ${maxBytes} bytes`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

async function loadUrl(src: string, opts: ImageSourceOptions, maxBytes: number): Promise<LoadedImage> {
  const deps = opts.deps ?? {};
  const doFetch = deps.fetch ?? fetch;
  // One deadline covers DNS, every redirect hop and the body read, so a slow
  // host cannot hold the caller (and save_post's per-brand lock) indefinitely.
  const signal = AbortSignal.timeout(opts.timeoutMs ?? FETCH_TIMEOUT_MS);
  let url: URL;
  try { url = new URL(src); } catch { throw new ImageSourceError(`invalid image URL: ${src}`); }
  try {
    for (let hop = 0; ; hop++) {
      await assertPublicHttps(url, deps, signal);
      const res = await doFetch(url, { redirect: "manual", signal });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location || hop >= MAX_REDIRECTS) throw new ImageSourceError(`too many or invalid redirects for ${src}`);
        url = new URL(location, url); // re-validated at the top of the loop
        continue;
      }
      if (!res.ok) throw new ImageSourceError(`fetch ${url.href}: HTTP ${res.status}`);
      return finish(await readCapped(res, maxBytes), `image at ${url.href}`);
    }
  } catch (err) {
    if (err instanceof ImageSourceError) throw err;
    if (signal.aborted) throw new ImageSourceError(`fetching ${src} timed out`);
    throw new ImageSourceError(`fetch ${src}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Loads an image from a local path (relative paths resolve against brandDir) or a public https URL. Throws ImageSourceError. */
export async function loadImageSource(src: string, opts: ImageSourceOptions): Promise<LoadedImage> {
  const maxBytes = opts.maxBytes ?? MAX_IMAGE_BYTES;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(src)) return loadUrl(src, opts, maxBytes);
  return loadLocal(src, opts, maxBytes);
}
