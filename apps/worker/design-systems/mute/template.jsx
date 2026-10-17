// MUTE — Quiet · premium. Lots of whitespace, small type, hairline rules, serif accents.

function MuteTemplate({ slide, idx, total, handle, year, pal, fonts, mark }) {
  const chrome = (
    <>
      <div style={{
        position: 'absolute', top: 56, left: 72, right: 72,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontFamily: fonts.body, fontSize: 16, letterSpacing: '0.04em', color: pal.muted,
      }}>
        <span>{handle}</span>
        <span style={{ fontFamily: fonts.display, fontStyle: 'italic', color: pal.ink }}>№ {String(idx+1).padStart(2,'0')}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>MMXXVI</span>
      </div>
      <div style={{ position: 'absolute', left: 72, right: 72, top: 96, height: 1, background: pal.rule }} />
      <div style={{
        position: 'absolute', bottom: 56, left: 72, right: 72, height: 1, background: pal.rule,
      }} />
      <div style={{
        position: 'absolute', bottom: 28, left: 72, right: 72,
        display: 'flex', justifyContent: 'space-between',
        fontFamily: fonts.body, fontSize: 14, letterSpacing: '0.08em', color: pal.muted, textTransform: 'uppercase',
      }}>
        <span>The Pour-Over Field Guide</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{String(idx+1).padStart(2,'0')} / {String(total).padStart(2,'0')}</span>
      </div>
    </>
  );
  const wrap = (children) => (
    <div style={{
      width: SLIDE_W, height: SLIDE_H, background: pal.bg, color: pal.ink,
      fontFamily: fonts.body, position: 'relative', overflow: 'hidden',
    }}>
      {chrome}
      {children}
    </div>
  );

  if (slide.kind === 'cover') {
    return wrap(
      <>
        <div style={{ position: 'absolute', left: 72, top: 200 }}>
          <BrandMark color={pal.accent} size={44} variant={mark} />
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 540, textAlign: 'center' }}>
          <div style={{
            fontFamily: fonts.display, fontStyle: 'italic', fontSize: 116, lineHeight: 1.04,
            letterSpacing: '-0.03em', fontWeight: 400, textWrap: 'balance', padding: '0 72px',
          }}>
            {String(slide.title || '').split(/\s+/).filter(Boolean).map((w, i, arr) => (
              <span key={i} style={{ color: i === Math.floor(arr.length / 2) ? pal.accent : pal.ink }}>{w}{' '}</span>
            ))}
          </div>
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 240, textAlign: 'center' }}>
          <div style={{ fontSize: 22, lineHeight: 1.5, color: pal.muted, maxWidth: 620, margin: '0 auto' }}>
            {slide.subtitle}
          </div>
        </div>
      </>
    );
  }

  if (slide.kind === 'intro') {
    return wrap(
      <>
        <div style={{ position: 'absolute', left: 72, top: 240 }}>
          <div style={{ fontFamily: fonts.body, fontSize: 14, letterSpacing: '0.2em', textTransform: 'uppercase', color: pal.muted }}>
            — {slide.eyebrow}
          </div>
        </div>
        <div style={{ position: 'absolute', left: 72, right: 220, top: 320 }}>
          <h2 style={{
            fontFamily: fonts.display, fontStyle: 'italic', fontWeight: 400,
            fontSize: 96, lineHeight: 1.05, letterSpacing: '-0.025em', margin: 0,
          }}>{slide.title}</h2>
        </div>
        <div style={{ position: 'absolute', left: 72, right: 300, bottom: 220 }}>
          <div style={{ fontSize: 24, lineHeight: 1.6, color: pal.ink }}>
            {slide.body}
          </div>
          <div style={{ marginTop: 32, fontFamily: fonts.body, fontSize: 14, letterSpacing: '0.14em', textTransform: 'uppercase', color: pal.accent }}>
            {slide.meta}
          </div>
        </div>
      </>
    );
  }

  if (slide.kind === 'numbered') {
    return wrap(
      <>
        <div style={{
          position: 'absolute', left: 72, top: 200,
          fontFamily: fonts.display, fontStyle: 'italic', fontSize: 60, color: pal.accent,
        }}>
          {slide.number}.
        </div>
        <div style={{ position: 'absolute', right: 72, top: 216, fontFamily: fonts.body, fontSize: 14, letterSpacing: '0.2em', textTransform: 'uppercase', color: pal.muted }}>
          {slide.label}
        </div>
        <div style={{ position: 'absolute', left: 72, right: 72, top: 380 }}>
          <h2 style={{
            fontFamily: fonts.display, fontStyle: 'italic', fontWeight: 400,
            fontSize: 108, lineHeight: 1.02, letterSpacing: '-0.03em', margin: 0, textWrap: 'balance',
          }}>{slide.title}</h2>
        </div>
        <div style={{ position: 'absolute', left: 72, right: 72, bottom: 200, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56 }}>
          <div />
          <div style={{ fontSize: 22, lineHeight: 1.6 }}>
            {slide.body}
          </div>
        </div>
      </>
    );
  }

  if (slide.kind === 'stat') {
    return wrap(
      <>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 380, textAlign: 'center' }}>
          <div style={{ fontFamily: fonts.body, fontSize: 14, letterSpacing: '0.2em', textTransform: 'uppercase', color: pal.muted }}>
            — Observed —
          </div>
          <div style={{
            fontFamily: fonts.display, fontStyle: 'italic', fontWeight: 400,
            fontSize: 360, lineHeight: 0.95, letterSpacing: '-0.04em', color: pal.accent, marginTop: 40,
          }}>{slide.big}</div>
          <div style={{ fontFamily: fonts.body, fontSize: 18, letterSpacing: '0.22em', textTransform: 'uppercase', color: pal.muted, marginTop: 16 }}>
            {slide.unit}
          </div>
        </div>
        <div style={{ position: 'absolute', left: 180, right: 180, bottom: 200, textAlign: 'center' }}>
          <div style={{ fontSize: 22, lineHeight: 1.6, color: pal.ink }}>
            {slide.caption}
          </div>
          <div style={{ marginTop: 20, fontFamily: fonts.body, fontSize: 13, color: pal.muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {slide.footnote}
          </div>
        </div>
      </>
    );
  }

  if (slide.kind === 'list') {
    return wrap(
      <>
        <div style={{ position: 'absolute', left: 72, right: 72, top: 220 }}>
          <div style={{ fontFamily: fonts.body, fontSize: 14, letterSpacing: '0.2em', textTransform: 'uppercase', color: pal.muted }}>
            — A tabulated list —
          </div>
          <h2 style={{
            fontFamily: fonts.display, fontStyle: 'italic', fontWeight: 400,
            fontSize: 80, lineHeight: 1.05, letterSpacing: '-0.025em', margin: '40px 0 0', textWrap: 'balance',
          }}>{slide.title}</h2>
        </div>
        <div style={{ position: 'absolute', left: 72, right: 72, top: 500 }}>
          {slide.items.map((it, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '60px 1fr 1fr', alignItems: 'baseline',
              padding: '24px 0',
              borderBottom: `1px solid ${pal.rule}`,
            }}>
              <div style={{ fontFamily: fonts.body, fontSize: 14, letterSpacing: '0.1em', color: pal.muted }}>{it.n}</div>
              <div style={{ fontFamily: fonts.body, fontSize: 16, letterSpacing: '0.16em', textTransform: 'uppercase', color: pal.muted }}>{it.label}</div>
              <div style={{ fontFamily: fonts.display, fontStyle: 'italic', fontSize: 32, letterSpacing: '-0.02em', color: pal.ink }}>{it.v}</div>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (slide.kind === 'image') {
    return wrap(
      <>
        <div style={{ position: 'absolute', left: 180, right: 180, top: 200 }}>
          <ImgSlot label={slide.imageLabel} color={pal.ink} bg={pal.bg} mono={fonts.mono} aspect="3/4" />
        </div>
        <div style={{ position: 'absolute', left: 72, right: 72, bottom: 180, textAlign: 'center' }}>
          <div style={{ fontFamily: fonts.display, fontStyle: 'italic', fontSize: 48, lineHeight: 1.1, letterSpacing: '-0.02em', color: pal.accent }}>
            {slide.title}
          </div>
          <div style={{ marginTop: 20, fontSize: 20, lineHeight: 1.55, color: pal.muted, maxWidth: 680, margin: '20px auto 0' }}>
            {slide.caption}
          </div>
        </div>
      </>
    );
  }

  if (slide.kind === 'cta') {
    return wrap(
      <>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 460, textAlign: 'center' }}>
          <div style={{ fontFamily: fonts.body, fontSize: 14, letterSpacing: '0.22em', textTransform: 'uppercase', color: pal.muted }}>
            — Thank you for reading —
          </div>
          <h2 style={{
            fontFamily: fonts.display, fontStyle: 'italic', fontWeight: 400,
            fontSize: 96, lineHeight: 1.05, letterSpacing: '-0.03em', margin: '36px auto 0', maxWidth: 840, padding: '0 72px', color: pal.accent,
          }}>{slide.title}</h2>
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 220, textAlign: 'center' }}>
          <div style={{ fontSize: 22, lineHeight: 1.6, color: pal.ink, maxWidth: 560, margin: '0 auto' }}>
            {slide.body}
          </div>
          <div style={{ marginTop: 36, display: 'inline-flex', gap: 24, fontFamily: fonts.body, fontSize: 15, letterSpacing: '0.16em', textTransform: 'uppercase', color: pal.ink }}>
            <span>♥ {slide.handleCta}</span>
            <span style={{ color: pal.rule }}>|</span>
            <span style={{ color: pal.accent }}>⌇ {slide.saveCta}</span>
          </div>
        </div>
      </>
    );
  }

  return wrap(<div />);
}

window.MuteTemplate = MuteTemplate;
