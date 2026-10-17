import fs from "fs";
import path from "path";
import { z } from "zod/v4";

const PaletteSchema = z.object({
  bg: z.string(),
  ink: z.string(),
  accent: z.string(),
  muted: z.string(),
  rule: z.string(),
});

const HtmlTokenManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  engine: z.literal("html-tokens").optional().default("html-tokens"),
  fonts: z.object({
    serifRegular: z.string(),
    serifItalic: z.string(),
    sansRegular: z.string(),
    sansBold: z.string(),
    sansBlack: z.string(),
  }),
  defaultAccentPalette: z.array(z.string()),
  templates: z.object({
    cover: z.array(z.string()),
    body: z.array(z.string()),
    photoOverlay: z.array(z.string()),
  }),
});

const ReactJsxManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  engine: z.literal("react-jsx"),
  templateName: z.string(),
  googleFontsUrl: z.string(),
  fonts: z.object({
    display: z.string(),
    body: z.string(),
    mono: z.string(),
  }),
  palettes: z.object({
    light: PaletteSchema,
    dark: PaletteSchema,
  }),
  slideKinds: z.array(
    z.enum(["cover", "intro", "numbered", "stat", "list", "image", "cta"])
  ),
});

const DesignSystemSchema = z.union([HtmlTokenManifestSchema, ReactJsxManifestSchema]);

export type HtmlTokenManifest = z.infer<typeof HtmlTokenManifestSchema>;
export type ReactJsxManifest = z.infer<typeof ReactJsxManifestSchema>;
export type DesignSystemManifest = z.infer<typeof DesignSystemSchema>;

export type DesignSystem = DesignSystemManifest & {
  rootDir: string;
};

export function loadDesignSystem(id: string, designSystemsDir: string): DesignSystem {
  const rootDir = path.join(designSystemsDir, id);
  const manifestPath = path.join(rootDir, "design-system.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Design system not found: ${id} (expected ${manifestPath})`);
  }
  const raw = fs.readFileSync(manifestPath, "utf-8");
  const parsed = JSON.parse(raw);
  const manifest = DesignSystemSchema.parse(parsed);
  return { ...manifest, rootDir };
}

export function isHtmlTokens(ds: DesignSystem): ds is HtmlTokenManifest & { rootDir: string } {
  return ds.engine === "html-tokens";
}

export function isReactJsx(ds: DesignSystem): ds is ReactJsxManifest & { rootDir: string } {
  return ds.engine === "react-jsx";
}
