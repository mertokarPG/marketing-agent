// Shared bits for all slide renderers.
// Slides render at a fixed logical size (1080 × 1350) and get scaled by their parent.

const SLIDE_W = 1080;
const SLIDE_H = 1350;

// ── Placeholder mark (simple geometric, per-template tint) ───────────────────
function BrandMark({ color = 'currentColor', size = 40, variant = 'quad' }) {
  if (variant === 'ring') {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
        <circle cx="20" cy="20" r="17" stroke={color} strokeWidth="3" />
        <circle cx="20" cy="20" r="6" fill={color} />
      </svg>
    );
  }
  if (variant === 'bar') {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40">
        <rect x="4" y="6" width="32" height="6" fill={color} />
        <rect x="4" y="17" width="22" height="6" fill={color} />
        <rect x="4" y="28" width="14" height="6" fill={color} />
      </svg>
    );
  }
  // quad — default
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <path d="M20 4 C28 4 36 12 36 20 C28 20 20 28 20 36 C12 28 4 20 4 20 C12 20 20 12 20 4 Z" fill={color} />
    </svg>
  );
}

// ── Image placeholder (striped, labeled) ─────────────────────────────────────
function ImgSlot({ label = 'brand image', color, bg, aspect = '3/4', mono = "monospace" }) {
  return (
    <div style={{
      position: 'relative',
      width: '100%',
      aspectRatio: aspect,
      background: `repeating-linear-gradient(135deg, ${bg} 0 14px, ${hexWithAlpha(color, 0.08)} 14px 15px)`,
      border: `1px solid ${hexWithAlpha(color, 0.18)}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: hexWithAlpha(color, 0.55),
      fontFamily: mono,
      fontSize: 18,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
    }}>
      ↳ {label}
    </div>
  );
}

function hexWithAlpha(hex, a) {
  // accepts #rrggbb
  const h = hex.replace('#','');
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
  return `rgba(${r},${g},${b},${a})`;
}

// ── Header chrome per template ───────────────────────────────────────────────
// Every slide in the carousel except the first gets a consistent meta header.
function SlideChrome({ handle, year, pal, fonts, side = 'left', mark = 'quad' }) {
  return (
    <div style={{
      position: 'absolute', top: 44, left: 56, right: 56,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      fontFamily: fonts.body, fontSize: 20, color: pal.ink, letterSpacing: '-0.01em',
    }}>
      <span style={{ color: pal.muted }}>Brought to you by</span>
      <span style={{ fontWeight: 500 }}>{handle}</span>
      <span style={{ color: pal.muted, fontVariantNumeric: 'tabular-nums' }}>{year}</span>
    </div>
  );
}

function PageDots({ total, idx, pal }) {
  return (
    <div style={{
      position: 'absolute', bottom: 20, left: 0, right: 0,
      display: 'flex', justifyContent: 'center', gap: 8,
    }}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius: '50%',
          background: i === idx ? pal.ink : hexWithAlpha(pal.ink, 0.22),
        }} />
      ))}
    </div>
  );
}

Object.assign(window, { SLIDE_W, SLIDE_H, BrandMark, ImgSlot, SlideChrome, PageDots, hexWithAlpha });
