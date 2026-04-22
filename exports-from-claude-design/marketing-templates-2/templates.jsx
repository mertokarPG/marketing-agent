// Template definitions — 6 distinct systems.
// Each template defines: id, name, personality, fonts, palettes (light+dark), and a renderer per slide type.

const TEMPLATES = [
  {
    id: 'atelier',
    name: 'ATELIER',
    tag: 'Editorial · warm',
    fonts: {
      display: "'Fraunces', 'Times New Roman', serif",
      body: "'Inter', system-ui, sans-serif",
      mono: "'JetBrains Mono', ui-monospace, monospace",
    },
    palettes: {
      light: { bg: '#efe8dc', ink: '#1a1814', accent: '#b84a2a', muted: '#7a6f5e', rule: '#cdc4b3' },
      dark:  { bg: '#1a1814', ink: '#efe8dc', accent: '#e8784f', muted: '#a89a86', rule: '#3a342b' },
    },
  },
  {
    id: 'signal',
    name: 'SIGNAL',
    tag: 'Bold · punchy',
    fonts: {
      display: "'Archivo Black', 'Impact', sans-serif",
      body: "'Space Grotesk', system-ui, sans-serif",
      mono: "'Space Mono', ui-monospace, monospace",
    },
    palettes: {
      light: { bg: '#f4f1ea', ink: '#0a0a0a', accent: '#1f3dff', muted: '#6b6b6b', rule: '#d8d4c9' },
      dark:  { bg: '#0a0a0a', ink: '#f4f1ea', accent: '#6f85ff', muted: '#8a8a8a', rule: '#2a2a2a' },
    },
  },
  {
    id: 'mute',
    name: 'MUTE',
    tag: 'Quiet · premium',
    fonts: {
      display: "'Instrument Serif', 'Cormorant Garamond', serif",
      body: "'Geist', 'Inter', system-ui, sans-serif",
      mono: "'Geist Mono', ui-monospace, monospace",
    },
    palettes: {
      light: { bg: '#f7f5ef', ink: '#1f2a24', accent: '#2e4a3a', muted: '#8a8a80', rule: '#e0ddd4' },
      dark:  { bg: '#1a2320', ink: '#f0ece4', accent: '#8fb89e', muted: '#8a9590', rule: '#2f3a35' },
    },
  },
  {
    id: 'gridos',
    name: 'GRID/OS',
    tag: 'Technical · editorial',
    fonts: {
      display: "'Space Grotesk', system-ui, sans-serif",
      body: "'Space Grotesk', system-ui, sans-serif",
      mono: "'JetBrains Mono', ui-monospace, monospace",
    },
    palettes: {
      light: { bg: '#ecece6', ink: '#15150f', accent: '#ff5c1a', muted: '#6e6e66', rule: '#c9c9c0' },
      dark:  { bg: '#0f0f0c', ink: '#ecece6', accent: '#ff7a3d', muted: '#8a8a82', rule: '#2a2a26' },
    },
  },
  {
    id: 'bloom',
    name: 'BLOOM',
    tag: 'Warm · approachable',
    fonts: {
      display: "'Caprasimo', 'Fraunces', serif",
      body: "'DM Sans', system-ui, sans-serif",
      mono: "'DM Mono', ui-monospace, monospace",
    },
    palettes: {
      light: { bg: '#fce9d8', ink: '#3a1a2a', accent: '#7a2450', muted: '#8a6375', rule: '#ecd2bc' },
      dark:  { bg: '#2a0e1c', ink: '#fce9d8', accent: '#f2a4c4', muted: '#b38ea0', rule: '#4a2035' },
    },
  },
  {
    id: 'archive',
    name: 'ARCHIVE',
    tag: 'Masthead · print',
    fonts: {
      display: "'Playfair Display', 'Times New Roman', serif",
      body: "'EB Garamond', 'Georgia', serif",
      mono: "'Courier Prime', ui-monospace, monospace",
    },
    palettes: {
      light: { bg: '#f5f1e8', ink: '#14120c', accent: '#8a1414', muted: '#6a6258', rule: '#14120c' },
      dark:  { bg: '#14120c', ink: '#f5f1e8', accent: '#e8a04a', muted: '#988e80', rule: '#f5f1e8' },
    },
  },
  {
    id: 'riso',
    name: 'RISO',
    tag: 'Print · overprint',
    fonts: {
      display: "'Syne', 'Archivo Black', sans-serif",
      body: "'Syne', system-ui, sans-serif",
      mono: "'Courier Prime', ui-monospace, monospace",
    },
    palettes: {
      light: { bg: '#f3ecd8', ink: '#2b2a6e', accent: '#e74b3c', muted: '#6a6896', rule: '#c8c2a8' },
      dark:  { bg: '#1a1a42', ink: '#f3ecd8', accent: '#ff6a3d', muted: '#8a86b0', rule: '#302e58' },
    },
  },
  {
    id: 'vapor',
    name: 'VAPOR',
    tag: 'Soft · dream',
    fonts: {
      display: "'Gloock', 'Cormorant Garamond', serif",
      body: "'Outfit', system-ui, sans-serif",
      mono: "'JetBrains Mono', ui-monospace, monospace",
    },
    palettes: {
      light: { bg: '#f4e9f0', ink: '#2a2040', accent: '#a85fc2', muted: '#8a7698', rule: '#ddc8dc' },
      dark:  { bg: '#1a1028', ink: '#f4e9f0', accent: '#e09cff', muted: '#8a7a9a', rule: '#3a2a4a' },
    },
  },
  {
    id: 'bauhaus',
    name: 'BAUHAUS',
    tag: 'Geometric · primary',
    fonts: {
      display: "'Archivo Black', 'Futura', sans-serif",
      body: "'Archivo', system-ui, sans-serif",
      mono: "'Space Mono', ui-monospace, monospace",
    },
    palettes: {
      light: { bg: '#f0ece4', ink: '#0a0a0a', accent: '#e63b1e', muted: '#707070', rule: '#0a0a0a' },
      dark:  { bg: '#0a0a0a', ink: '#f0ece4', accent: '#ffcc00', muted: '#8a8a8a', rule: '#f0ece4' },
    },
  },
  {
    id: 'terminal',
    name: 'TERMINAL',
    tag: 'CRT · monospace',
    fonts: {
      display: "'VT323', 'Courier New', monospace",
      body: "'IBM Plex Mono', ui-monospace, monospace",
      mono: "'IBM Plex Mono', ui-monospace, monospace",
    },
    palettes: {
      light: { bg: '#e6f0dc', ink: '#0c2010', accent: '#1a8a2e', muted: '#6a7a68', rule: '#a8b8a0' },
      dark:  { bg: '#050a08', ink: '#3aff6a', accent: '#a0ff3a', muted: '#3a7a4a', rule: '#1a3a20' },
    },
  },
  {
    id: 'couture',
    name: 'COUTURE',
    tag: 'Luxe · magazine',
    fonts: {
      display: "'Cormorant Garamond', 'Didot', serif",
      body: "'Jost', system-ui, sans-serif",
      mono: "'Jost', system-ui, sans-serif",
    },
    palettes: {
      light: { bg: '#eae5de', ink: '#141414', accent: '#8a6a3a', muted: '#8a8280', rule: '#c8c0b8' },
      dark:  { bg: '#141414', ink: '#eae5de', accent: '#d4a55a', muted: '#8a8280', rule: '#2a2a2a' },
    },
  },
  {
    id: 'nocturne',
    name: 'NOCTURNE',
    tag: 'Avant-garde · dark',
    fonts: {
      display: "'Bricolage Grotesque', system-ui, sans-serif",
      body: "'IBM Plex Sans', system-ui, sans-serif",
      mono: "'IBM Plex Mono', ui-monospace, monospace",
    },
    palettes: {
      light: { bg: '#e8e8e2', ink: '#0c0c0a', accent: '#4a5f1a', muted: '#6a6a64', rule: '#c8c8c0' },
      dark:  { bg: '#0c0c0a', ink: '#e8e8e2', accent: '#c8ff3a', muted: '#7a7a74', rule: '#222220' },
    },
  },
];

window.TEMPLATES = TEMPLATES;
