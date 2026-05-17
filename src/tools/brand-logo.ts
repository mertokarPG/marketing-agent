import fs from "fs";
import path from "path";
import sharp from "sharp";

export interface GetBrandLogoInput {
  // Brand domain (e.g. "openai.com") or name (e.g. "OpenAI"). Brandfetch resolves both.
  brand: string;
  // Wordmark with text ("logo"), mark-only ("symbol"), or favicon-style ("icon"). Default "logo".
  variant?: "logo" | "symbol" | "icon";
  // "dark" = logo is dark-colored (best on LIGHT backgrounds). "light" = logo is light-colored (best on DARK backgrounds). Default "dark".
  theme?: "dark" | "light";
}

export interface BrandLogoResult {
  filePath: string; // absolute path to PNG on disk
  domain: string; // canonical brand domain Brandfetch returned
  name: string; // brand display name
  source: "brandfetch" | "favicon";
  variant: "logo" | "symbol" | "icon";
  theme: "dark" | "light";
}

// Flatten a URL-ish string to a reusable slug. "https://OpenAI.com" → "openai.com"
function normalizeDomain(input: string): string {
  const trimmed = input.trim().toLowerCase();
  return trimmed
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

interface BFFormat {
  src: string;
  format: "svg" | "png" | "webp" | "jpeg";
  width?: number | null;
  height?: number | null;
}
interface BFLogo {
  type: "logo" | "symbol" | "icon" | "other";
  theme?: "light" | "dark";
  formats: BFFormat[];
}
interface BFResponse {
  name?: string;
  domain?: string;
  logos?: BFLogo[];
}

// Prefer raster formats over SVG. Brandfetch's SVGs are often Illustrator
// exports with malformed namespaces (xmlns:x="&ns_sfw;" etc.) that librsvg
// refuses. Their PNGs are ≥800px, plenty for 1080-wide IG slides.
function pickFormat(logo: BFLogo): BFFormat | null {
  const rasters = logo.formats
    .filter((f) => f.format === "png" || f.format === "webp" || f.format === "jpeg")
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  if (rasters[0]) return rasters[0];
  const svg = logo.formats.find((f) => f.format === "svg");
  if (svg) return svg;
  return logo.formats[0] ?? null;
}

// Find the best logo matching the requested variant/theme, walking a sensible
// fallback ladder if the exact combo isn't available.
function pickLogo(
  logos: BFLogo[],
  variant: "logo" | "symbol" | "icon",
  theme: "light" | "dark"
): BFLogo | null {
  const byVariant = (v: string) => logos.filter((l) => l.type === v);
  const byTheme = (arr: BFLogo[], t: string) => arr.find((l) => l.theme === t);

  const variantLadder: Array<"logo" | "symbol" | "icon" | "other"> =
    variant === "logo"
      ? ["logo", "symbol", "icon", "other"]
      : variant === "symbol"
        ? ["symbol", "logo", "icon", "other"]
        : ["icon", "symbol", "logo", "other"];

  for (const v of variantLadder) {
    const pool = byVariant(v);
    const hit = byTheme(pool, theme) ?? pool[0];
    if (hit) return hit;
  }
  return logos[0] ?? null;
}

// Resolve a bare name ("OpenAI") to a canonical domain via Brandfetch search.
// Sort by qualityScore so well-known brands beat obscure near-matches.
async function resolveDomainViaSearch(query: string, key: string): Promise<string | null> {
  const res = await fetch(`https://api.brandfetch.io/v2/search/${encodeURIComponent(query)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return null;
  const hits = (await res.json()) as Array<{
    domain?: string;
    name?: string;
    qualityScore?: number;
  }>;
  if (!Array.isArray(hits) || hits.length === 0) return null;
  const q = query.toLowerCase();
  const ranked = [...hits].sort((a, b) => {
    // Exact-name match wins outright, then highest qualityScore.
    const aExact = a.name?.toLowerCase() === q ? 1 : 0;
    const bExact = b.name?.toLowerCase() === q ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;
    return (b.qualityScore ?? 0) - (a.qualityScore ?? 0);
  });
  return ranked[0]?.domain ?? null;
}

async function tryBrandfetch(
  query: string,
  variant: "logo" | "symbol" | "icon",
  theme: "light" | "dark"
): Promise<
  | { match: BFLogo; fmt: BFFormat; name: string; canonicalDomain: string }
  | null
> {
  const key = process.env.BRANDFETCH_API_KEY;
  if (!key) return null;

  // If the input doesn't look like a domain (no dot), resolve it via search first.
  let domain = query;
  if (!query.includes(".")) {
    const resolved = await resolveDomainViaSearch(query, key);
    if (!resolved) {
      console.warn(`[brand-logo] brandfetch search for "${query}" returned no hits`);
      return null;
    }
    domain = resolved;
  }

  const res = await fetch(`https://api.brandfetch.io/v2/brands/${encodeURIComponent(domain)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    // 404 = unknown brand; 4xx/5xx = transient. Either way, fall through to
    // favicon fallback rather than throw — the agent should still get a logo.
    console.warn(`[brand-logo] brandfetch ${domain} → ${res.status}`);
    return null;
  }
  const body = (await res.json()) as BFResponse;
  if (!body.logos || body.logos.length === 0) return null;
  const match = pickLogo(body.logos, variant, theme);
  if (!match) return null;
  const fmt = pickFormat(match);
  if (!fmt) return null;
  return {
    match,
    fmt,
    name: body.name ?? domain,
    canonicalDomain: body.domain ?? domain,
  };
}

// Rasterize anything (svg/png/webp/jpeg/ico) to a PNG on disk at the requested
// target width. sharp handles all the formats; SVG gets rendered via librsvg,
// which is what we want for crisp scaling.
async function rasterizeToPng(sourceBytes: Buffer, destPath: string, targetWidth = 1024): Promise<void> {
  await sharp(sourceBytes, { density: 300 })
    .resize({ width: targetWidth, withoutEnlargement: false })
    .png({ compressionLevel: 9 })
    .toFile(destPath);
}

export async function getBrandLogo(input: GetBrandLogoInput): Promise<BrandLogoResult> {
  const domain = normalizeDomain(input.brand);
  const variant = input.variant ?? "logo";
  const theme = input.theme ?? "dark";

  const cacheDir = path.resolve("tmp/brand-logos");
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  const safeDomain = domain.replace(/[^a-z0-9.-]/g, "_");
  const cacheFile = path.join(cacheDir, `${safeDomain}__${variant}__${theme}.png`);
  if (fs.existsSync(cacheFile)) {
    return {
      filePath: cacheFile,
      domain,
      name: domain,
      source: "brandfetch",
      variant,
      theme,
    };
  }

  // ── Try Brandfetch first ────────────────────────────────────────────────
  const bf = await tryBrandfetch(domain, variant, theme);
  if (bf) {
    const res = await fetch(bf.fmt.src);
    if (!res.ok) throw new Error(`brandfetch CDN ${res.status} for ${bf.fmt.src}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await rasterizeToPng(buf, cacheFile);
    return {
      filePath: cacheFile,
      domain: bf.canonicalDomain,
      name: bf.name,
      source: "brandfetch",
      variant: (bf.match.type === "other" ? variant : bf.match.type) as "logo" | "symbol" | "icon",
      theme: (bf.match.theme ?? theme) as "light" | "dark",
    };
  }

  // ── Fallback: Google favicon (free, no auth, no size guarantees) ────────
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256`;
  const res = await fetch(faviconUrl);
  if (!res.ok) throw new Error(`favicon ${res.status} for ${domain}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await rasterizeToPng(buf, cacheFile, 512);
  return {
    filePath: cacheFile,
    domain,
    name: domain,
    source: "favicon",
    variant: "icon",
    theme,
  };
}
