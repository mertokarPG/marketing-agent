// Tools for handling fill-in-the-blank prompts in the prompt bank.
//
// The bank contains prompts with placeholders like [YOUR PERSONA], [BRAND],
// [COLOR], {Samsung_E250}. To produce visually distinct images for the
// Prompt Share carousel format, we substitute a DIFFERENT value into each
// of the N variations — so 5 generations of the "urban alleyway portrait"
// give us 5 visibly different people in the same scene.

export interface PlaceholderHit {
  raw: string;
  kind: "persona" | "brand" | "color" | "object" | "input-image";
  start: number;
  end: number;
}

// Personas are noun phrases WITHOUT a leading article. The prompts in the bank
// usually already have "a "/"the "/"my "/"of a " before [YOUR PERSONA], so
// dropping the article here avoids "of a a 28-year-old…" double-determiners.
const PERSONAS: string[] = [
  "28-year-old Korean woman with long jet-black hair and a small nose ring",
  "35-year-old Black man with a low-fade haircut, neat beard, and gold septum ring",
  "24-year-old Latina woman with curly chestnut hair, freckles, and hoop earrings",
  "50-year-old Italian woman with cropped silver hair and a sharp jawline",
  "22-year-old half-Japanese man with bleached platinum hair and round wire glasses",
  "40-year-old Scandinavian woman with a blunt blonde bob and pale blue eyes",
  "30-year-old Indian man with shoulder-length wavy hair and a thin mustache",
  "26-year-old French woman with a tousled brunette bob and a faint scar across her brow",
  "38-year-old Brazilian man with sun-bleached curls and a tattoo crawling up his neck",
  "19-year-old East Asian woman with bangs, twin braids, and a tiny stud earring",
];

const BRANDS: string[] = [
  "Nike",
  "Adidas",
  "Patagonia",
  "Prada",
  "Carhartt",
  "Gucci",
  "Stüssy",
  "Lululemon",
  "Asics",
  "Acne Studios",
];

const COLORS: string[] = [
  "deep crimson",
  "electric cobalt",
  "olive green",
  "burnt orange",
  "lavender",
  "fluorescent yellow",
  "stone grey",
  "midnight navy",
  "rose pink",
  "forest green",
];

const OBJECTS: string[] = [
  "Sony Walkman",
  "Nintendo Game Boy",
  "Polaroid SX-70 camera",
  "Bose QC headphones",
  "Leica M3 rangefinder",
  "Olympus Mju II",
  "iPod Classic",
  "Casio F-91W watch",
  "Tamagotchi",
  "Moleskine notebook",
];

const PLACEHOLDER_RE = /\[[A-Z][^\]\n]*\]|\{[A-Za-z_][A-Za-z0-9_]*\}/g;

function classify(raw: string): PlaceholderHit["kind"] {
  const inner = raw.replace(/^[\[{]|[\]}]$/g, "").trim().toUpperCase();
  if (inner.includes("INPUT IMAGE")) return "input-image";
  if (inner.includes("PERSONA") || inner.includes("PERSON") || inner.includes("USER_PHOTO"))
    return "persona";
  if (inner.includes("BRAND")) return "brand";
  if (inner.includes("COLOR") || inner.includes("COLOUR")) return "color";
  return "object";
}

export function detectPlaceholders(prompt: string): PlaceholderHit[] {
  const hits: PlaceholderHit[] = [];
  for (const m of prompt.matchAll(PLACEHOLDER_RE)) {
    if (m.index === undefined) continue;
    hits.push({
      raw: m[0],
      kind: classify(m[0]),
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return hits;
}

function pickFor(kind: PlaceholderHit["kind"], i: number): string {
  switch (kind) {
    case "persona":
    case "input-image":
      return PERSONAS[i % PERSONAS.length];
    case "brand":
      return BRANDS[i % BRANDS.length];
    case "color":
      return COLORS[i % COLORS.length];
    case "object":
      return OBJECTS[i % OBJECTS.length];
  }
}

// Substitute every placeholder with a value chosen by variation index.
// All placeholders of the SAME KIND in one variation get the SAME value
// (so a "white t-shirt [BRAND] black pants [BRAND] sneakers" stays self-consistent),
// while DIFFERENT variations pick different values, so 5 generations look distinct.
export function fillPlaceholdersForVariation(
  prompt: string,
  variationIndex: number
): { prompt: string; fills: Record<string, string> } {
  const hits = detectPlaceholders(prompt);
  if (hits.length === 0) return { prompt, fills: {} };

  // Group hits by kind so all [BRAND] in one variation map to the same brand.
  const valueByKind: Partial<Record<PlaceholderHit["kind"], string>> = {};
  for (const h of hits) {
    if (!valueByKind[h.kind]) valueByKind[h.kind] = pickFor(h.kind, variationIndex);
  }

  let out = "";
  let cursor = 0;
  for (const h of hits) {
    out += prompt.slice(cursor, h.start);
    out += valueByKind[h.kind]!;
    cursor = h.end;
  }
  out += prompt.slice(cursor);

  const fills: Record<string, string> = {};
  for (const [kind, value] of Object.entries(valueByKind)) {
    if (value) fills[kind] = value;
  }
  return { prompt: out, fills };
}
