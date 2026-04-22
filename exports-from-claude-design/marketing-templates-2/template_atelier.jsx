// ATELIER — editorial, warm. Large serif titles, generous margin, rule lines.
// Cover: asymmetric hierarchy with kicker + italicized eyebrow.

function AtelierTemplate({ slide, idx, total, handle, year, pal, fonts, mark }) {
  const chrome = <SlideChrome handle={handle} year={year} pal={pal} fonts={fonts} />;
  const footerRule = (
    <div style={{
      position: 'absolute', left: 56, right: 56, bottom: 58,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      fontFamily: fonts.mono, fontSize: 16, color: pal.muted, letterSpacing: '0.06em',
      textTransform: 'uppercase', borderTop: `1px solid ${pal.rule}`, paddingTop: 18,
    }}>
      <span>{handle.replace('@','')} · field notes</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{String(idx+1).padStart(2,'0')} / {String(total).padStart(2,'0')}</span>
    </div>
  );

  const container = (children, { cover = false } = {}) => (
    <div style={{
      width: SLIDE_W, height: SLIDE_H, background: pal.bg, color: pal.ink,
      fontFamily: fonts.body, position: 'relative', overflow: 'hidden',
    }}>
      {!cover && chrome}
      {children}
      {footerRule}
    </div>
  );

  if (slide.kind === 'cover') {
    return container(
      <>
        <div style={{ position: 'absolute', top: 56, left: 56, right: 56, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ fontFamily: fonts.mono, fontSize: 18, letterSpacing: '0.14em', textTransform: 'uppercase', color: pal.muted }}>
            {slide.eyebrow} &nbsp;·&nbsp; {slide.kicker}
          </div>
          <BrandMark color={pal.accent} size={56} variant={mark} />
        </div>
        <div style={{ position: 'absolute', left: 56, right: 56, top: 380 }}>
          <div style={{
            fontFamily: fonts.display, fontWeight: 300, fontSize: 128, lineHeight: 1.02,
            letterSpacing: '-0.035em', color: pal.ink, fontStyle: 'italic',
            textWrap: 'balance',
          }}>
            {slide.title.split(' ').map((w,i) => (
              <span key={i} style={{ color: i === 1 ? pal.accent : pal.ink }}>{w} </span>
            ))}
          </div>
        </div>
        <div style={{ position: 'absolute', left: 56, right: 200, bottom: 180 }}>
          <div style={{ fontFamily: fonts.body, fontSize: 28, lineHeight: 1.35, color: pal.ink, maxWidth: 720 }}>
            {slide.subtitle}
          </div>
        </div>
      </>,
      { cover: true }
    );
  }

  if (slide.kind === 'intro') {
    return container(
      <>
        <div style={{ position: 'absolute', left: 56, top: 180 }}>
          <div style={{ fontFamily: fonts.mono, fontSize: 16, letterSpacing: '0.14em', textTransform: 'uppercase', color: pal.accent }}>
            {slide.eyebrow}
          </div>
        </div>
        <div style={{ position: 'absolute', left: 56, right: 56, top: 260 }}>
          <h2 style={{
            fontFamily: fonts.display, fontWeight: 400, fontSize: 84, lineHeight: 1.05,
            letterSpacing: '-0.03em', margin: 0, fontStyle: 'italic', textWrap: 'balance',
          }}>{slide.title}</h2>
        </div>
        <div style={{ position: 'absolute', left: 56, right: 200, bottom: 260 }}>
          <div style={{ fontSize: 30, lineHeight: 1.45, color: pal.ink, fontWeight: 400 }}>
            {slide.body}
          </div>
          <div style={{ marginTop: 32, fontFamily: fonts.mono, fontSize: 16, color: pal.muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {slide.meta}
          </div>
        </div>
      </>
    );
  }

  if (slide.kind === 'numbered') {
    return container(
      <>
        <div style={{
          position: 'absolute', right: 56, top: 180,
          fontFamily: fonts.display, fontWeight: 300, fontStyle: 'italic',
          fontSize: 220, lineHeight: 0.9, color: pal.accent,
        }}>{slide.number}</div>
        <div style={{ position: 'absolute', left: 56, top: 200, fontFamily: fonts.mono, fontSize: 16, letterSpacing: '0.14em', textTransform: 'uppercase', color: pal.muted }}>
          {slide.label}
        </div>
        <div style={{ position: 'absolute', left: 56, right: 56, top: 560 }}>
          <h2 style={{
            fontFamily: fonts.display, fontWeight: 400, fontSize: 96, lineHeight: 1.02,
            letterSpacing: '-0.03em', margin: 0, fontStyle: 'italic', textWrap: 'balance',
          }}>{slide.title}</h2>
          <div style={{ marginTop: 56, fontSize: 28, lineHeight: 1.45, maxWidth: 860 }}>
            {slide.body}
          </div>
        </div>
      </>
    );
  }

  if (slide.kind === 'stat') {
    return container(
      <>
        <div style={{ position: 'absolute', left: 56, right: 56, top: 320, textAlign: 'center' }}>
          <div style={{
            fontFamily: fonts.display, fontWeight: 300, fontSize: 440, lineHeight: 0.88,
            letterSpacing: '-0.05em', color: pal.accent, fontStyle: 'italic',
          }}>{slide.big}</div>
          <div style={{ marginTop: 16, fontFamily: fonts.mono, fontSize: 22, letterSpacing: '0.18em', textTransform: 'uppercase', color: pal.muted }}>
            {slide.unit}
          </div>
        </div>
        <div style={{ position: 'absolute', left: 120, right: 120, bottom: 240, textAlign: 'center' }}>
          <div style={{ fontFamily: fonts.display, fontStyle: 'italic', fontSize: 38, lineHeight: 1.35, textWrap: 'balance' }}>
            {slide.caption}
          </div>
          <div style={{ marginTop: 20, fontFamily: fonts.mono, fontSize: 16, color: pal.muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {slide.footnote}
          </div>
        </div>
      </>
    );
  }

  if (slide.kind === 'list') {
    return container(
      <>
        <div style={{ position: 'absolute', left: 56, right: 56, top: 180 }}>
          <h2 style={{
            fontFamily: fonts.display, fontWeight: 400, fontSize: 80, lineHeight: 1.05,
            letterSpacing: '-0.03em', margin: 0, fontStyle: 'italic',
          }}>{slide.title}</h2>
        </div>
        <div style={{ position: 'absolute', left: 56, right: 56, top: 380 }}>
          {slide.items.map((it, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '80px 1fr 1fr', alignItems: 'baseline',
              padding: '22px 0', borderTop: `1px solid ${pal.rule}`,
              borderBottom: i === slide.items.length - 1 ? `1px solid ${pal.rule}` : 'none',
            }}>
              <div style={{ fontFamily: fonts.mono, fontSize: 18, color: pal.accent, letterSpacing: '0.1em' }}>{it.n}</div>
              <div style={{ fontFamily: fonts.mono, fontSize: 16, letterSpacing: '0.14em', textTransform: 'uppercase', color: pal.muted }}>{it.label}</div>
              <div style={{ fontFamily: fonts.display, fontStyle: 'italic', fontSize: 36, letterSpacing: '-0.02em' }}>{it.v}</div>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (slide.kind === 'image') {
    return container(
      <>
        <div style={{ position: 'absolute', left: 56, top: 160, width: 580 }}>
          <ImgSlot label={slide.imageLabel} color={pal.ink} bg={pal.bg} mono={fonts.mono} aspect="3/4" />
        </div>
        <div style={{ position: 'absolute', right: 56, top: 220, width: 400 }}>
          <div style={{ fontFamily: fonts.mono, fontSize: 16, letterSpacing: '0.14em', textTransform: 'uppercase', color: pal.accent, marginBottom: 24 }}>
            Plate 02
          </div>
          <h2 style={{
            fontFamily: fonts.display, fontWeight: 400, fontSize: 72, lineHeight: 1.0,
            letterSpacing: '-0.03em', margin: 0, fontStyle: 'italic',
          }}>{slide.title}</h2>
        </div>
        <div style={{ position: 'absolute', right: 56, bottom: 200, width: 400 }}>
          <div style={{ fontSize: 24, lineHeight: 1.45, color: pal.ink }}>
            {slide.caption}
          </div>
        </div>
      </>
    );
  }

  if (slide.kind === 'cta') {
    return container(
      <>
        <div style={{ position: 'absolute', left: 56, right: 56, top: 420 }}>
          <h2 style={{
            fontFamily: fonts.display, fontWeight: 400, fontSize: 104, lineHeight: 1.02,
            letterSpacing: '-0.03em', margin: 0, fontStyle: 'italic', color: pal.accent, textWrap: 'balance',
          }}>{slide.title}</h2>
          <div style={{ marginTop: 40, fontSize: 30, lineHeight: 1.4, maxWidth: 780 }}>
            {slide.body}
          </div>
        </div>
        <div style={{ position: 'absolute', left: 56, right: 56, bottom: 220, display: 'flex', gap: 20, alignItems: 'center' }}>
          <div style={{
            padding: '18px 30px', border: `1.5px solid ${pal.ink}`, borderRadius: 999,
            fontFamily: fonts.mono, fontSize: 18, letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>♥ {slide.handleCta}</div>
          <div style={{
            padding: '18px 30px', background: pal.accent, color: pal.bg, borderRadius: 999,
            fontFamily: fonts.mono, fontSize: 18, letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>⌇ {slide.saveCta}</div>
        </div>
      </>
    );
  }

  return container(<div />);
}

window.AtelierTemplate = AtelierTemplate;
