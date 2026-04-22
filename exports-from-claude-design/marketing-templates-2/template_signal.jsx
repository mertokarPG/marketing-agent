// SIGNAL — Bold · punchy. Massive condensed display, tight leading, contrast blocks.

function SignalTemplate({ slide, idx, total, handle, year, pal, fonts, mark }) {
  const topBar = (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, padding: '28px 56px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      borderBottom: `2px solid ${pal.ink}`, background: pal.bg,
      fontFamily: fonts.mono, fontSize: 18, color: pal.ink, letterSpacing: '0.04em',
    }}>
      <span>{handle}</span>
      <span style={{ textTransform: 'uppercase', letterSpacing: '0.2em' }}>Dispatch №{String(idx+1).padStart(2,'0')}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{year}</span>
    </div>
  );
  const bottomBar = (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, padding: '24px 56px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      borderTop: `2px solid ${pal.ink}`, background: pal.bg,
      fontFamily: fonts.mono, fontSize: 16, color: pal.ink, letterSpacing: '0.06em', textTransform: 'uppercase',
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 10, height: 10, background: pal.accent, display: 'inline-block' }} /> live
      </span>
      <span>Swipe →</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{String(idx+1).padStart(2,'0')}/{String(total).padStart(2,'0')}</span>
    </div>
  );

  const wrap = (children) => (
    <div style={{
      width: SLIDE_W, height: SLIDE_H, background: pal.bg, color: pal.ink,
      fontFamily: fonts.body, position: 'relative', overflow: 'hidden',
    }}>
      {topBar}
      {children}
      {bottomBar}
    </div>
  );

  if (slide.kind === 'cover') {
    return wrap(
      <>
        <div style={{ position: 'absolute', left: 56, top: 140, right: 56, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: fonts.mono, fontSize: 20, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            {slide.eyebrow} / {slide.kicker}
          </div>
          <BrandMark color={pal.accent} size={64} variant={mark} />
        </div>
        <div style={{ position: 'absolute', left: 40, right: 40, top: 260 }}>
          <div style={{
            fontFamily: fonts.display, fontSize: 200, lineHeight: 0.88,
            letterSpacing: '-0.04em', textTransform: 'uppercase', textWrap: 'balance',
          }}>
            <span style={{ color: pal.ink }}>The quiet</span><br />
            <span style={{ color: pal.accent }}>ritual</span><br />
            <span style={{ color: pal.ink }}>of pour-</span><br />
            <span style={{ color: pal.ink }}>over.</span>
          </div>
        </div>
        <div style={{ position: 'absolute', left: 56, right: 400, bottom: 130 }}>
          <div style={{ fontSize: 26, lineHeight: 1.35, color: pal.ink }}>
            {slide.subtitle}
          </div>
        </div>
      </>
    );
  }

  if (slide.kind === 'intro') {
    return wrap(
      <>
        <div style={{ position: 'absolute', left: 56, top: 160 }}>
          <div style={{
            display: 'inline-block', padding: '8px 16px', background: pal.accent, color: pal.bg,
            fontFamily: fonts.mono, fontSize: 18, letterSpacing: '0.18em', textTransform: 'uppercase',
          }}>{slide.eyebrow}</div>
        </div>
        <div style={{ position: 'absolute', left: 40, right: 40, top: 260 }}>
          <h2 style={{
            fontFamily: fonts.display, fontSize: 140, lineHeight: 0.92, letterSpacing: '-0.035em',
            textTransform: 'uppercase', margin: 0, textWrap: 'balance',
          }}>{slide.title}</h2>
        </div>
        <div style={{ position: 'absolute', left: 56, right: 56, bottom: 180 }}>
          <div style={{
            fontSize: 30, lineHeight: 1.4, paddingTop: 30, borderTop: `2px solid ${pal.ink}`,
            maxWidth: 820,
          }}>
            {slide.body}
          </div>
          <div style={{ marginTop: 20, fontFamily: fonts.mono, fontSize: 18, letterSpacing: '0.1em', textTransform: 'uppercase', color: pal.accent }}>
            ↳ {slide.meta}
          </div>
        </div>
      </>
    );
  }

  if (slide.kind === 'numbered') {
    return wrap(
      <>
        <div style={{ position: 'absolute', left: 56, top: 130, right: 56 }}>
          <div style={{ fontFamily: fonts.mono, fontSize: 20, letterSpacing: '0.2em', textTransform: 'uppercase', color: pal.accent }}>
            {slide.label}
          </div>
        </div>
        <div style={{
          position: 'absolute', left: 56, top: 180,
          fontFamily: fonts.display, fontSize: 560, lineHeight: 0.78,
          color: pal.accent, letterSpacing: '-0.06em',
        }}>{slide.number}</div>
        <div style={{ position: 'absolute', left: 40, right: 40, top: 720 }}>
          <h2 style={{
            fontFamily: fonts.display, fontSize: 120, lineHeight: 0.95, letterSpacing: '-0.035em',
            textTransform: 'uppercase', margin: 0, textWrap: 'balance',
          }}>{slide.title}</h2>
        </div>
        <div style={{ position: 'absolute', left: 56, right: 56, bottom: 180 }}>
          <div style={{ fontSize: 26, lineHeight: 1.4, maxWidth: 860, paddingTop: 24, borderTop: `2px solid ${pal.ink}` }}>
            {slide.body}
          </div>
        </div>
      </>
    );
  }

  if (slide.kind === 'stat') {
    return wrap(
      <>
        <div style={{
          position: 'absolute', left: 0, right: 0, top: 160,
          textAlign: 'center', fontFamily: fonts.display,
          fontSize: 620, lineHeight: 0.8, color: pal.ink,
          letterSpacing: '-0.06em',
        }}>
          <span style={{ color: pal.ink }}>{slide.big.split(':')[0]}</span>
          <span style={{ color: pal.accent }}>:</span>
          <span style={{ color: pal.ink }}>{slide.big.split(':')[1]}</span>
        </div>
        <div style={{
          position: 'absolute', left: 56, right: 56, bottom: 260,
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
          paddingTop: 28, borderTop: `2px solid ${pal.ink}`,
        }}>
          <div style={{ fontFamily: fonts.mono, fontSize: 22, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            {slide.unit}
          </div>
          <div style={{ maxWidth: 560, fontSize: 26, lineHeight: 1.35, textAlign: 'right' }}>
            {slide.caption}
          </div>
        </div>
        <div style={{ position: 'absolute', left: 56, right: 56, bottom: 180, fontFamily: fonts.mono, fontSize: 16, color: pal.muted, textAlign: 'right', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {slide.footnote}
        </div>
      </>
    );
  }

  if (slide.kind === 'list') {
    return wrap(
      <>
        <div style={{ position: 'absolute', left: 56, right: 56, top: 150 }}>
          <h2 style={{
            fontFamily: fonts.display, fontSize: 104, lineHeight: 0.95, letterSpacing: '-0.035em',
            textTransform: 'uppercase', margin: 0, textWrap: 'balance',
          }}>{slide.title}</h2>
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 440, display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: `2px solid ${pal.ink}` }}>
          {slide.items.map((it, i) => (
            <div key={i} style={{
              padding: '36px 56px',
              borderRight: i % 2 === 0 ? `2px solid ${pal.ink}` : 'none',
              borderBottom: `2px solid ${pal.ink}`,
              background: i === 0 ? pal.accent : pal.bg,
              color: i === 0 ? pal.bg : pal.ink,
              minHeight: 140,
            }}>
              <div style={{ fontFamily: fonts.mono, fontSize: 18, letterSpacing: '0.1em' }}>{it.n}</div>
              <div style={{ fontFamily: fonts.display, fontSize: 44, textTransform: 'uppercase', letterSpacing: '-0.02em', marginTop: 8 }}>
                {it.v}
              </div>
              <div style={{ fontFamily: fonts.mono, fontSize: 16, letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 6, opacity: 0.8 }}>
                {it.label}
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (slide.kind === 'image') {
    return wrap(
      <>
        <div style={{ position: 'absolute', left: 0, top: 100, right: 0, height: 820 }}>
          <div style={{ padding: '0 56px' }}>
            <ImgSlot label={slide.imageLabel} color={pal.ink} bg={pal.bg} mono={fonts.mono} aspect="16/11" />
          </div>
        </div>
        <div style={{ position: 'absolute', left: 56, right: 56, top: 960 }}>
          <h2 style={{
            fontFamily: fonts.display, fontSize: 80, lineHeight: 0.95, letterSpacing: '-0.03em',
            textTransform: 'uppercase', margin: 0,
          }}>{slide.title}</h2>
          <div style={{ marginTop: 20, fontSize: 24, lineHeight: 1.4, maxWidth: 820, color: pal.ink }}>
            {slide.caption}
          </div>
        </div>
      </>
    );
  }

  if (slide.kind === 'cta') {
    return wrap(
      <>
        <div style={{
          position: 'absolute', left: 0, right: 0, top: 220,
          textAlign: 'center', fontFamily: fonts.display,
          fontSize: 220, lineHeight: 0.88, letterSpacing: '-0.05em',
          textTransform: 'uppercase',
        }}>
          <span style={{ color: pal.ink }}>Follow.</span><br />
          <span style={{ color: pal.accent }}>Save.</span><br />
          <span style={{ color: pal.ink }}>Repeat.</span>
        </div>
        <div style={{ position: 'absolute', left: 56, right: 56, bottom: 180 }}>
          <div style={{ paddingTop: 28, borderTop: `2px solid ${pal.ink}`, fontSize: 28, lineHeight: 1.4, maxWidth: 760 }}>
            {slide.body}
          </div>
          <div style={{ marginTop: 36, display: 'flex', gap: 12 }}>
            <div style={{ padding: '18px 26px', background: pal.ink, color: pal.bg, fontFamily: fonts.mono, fontSize: 18, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              ♥ {slide.handleCta}
            </div>
            <div style={{ padding: '18px 26px', background: pal.accent, color: pal.bg, fontFamily: fonts.mono, fontSize: 18, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              ⌇ {slide.saveCta}
            </div>
          </div>
        </div>
      </>
    );
  }

  return wrap(<div />);
}

window.SignalTemplate = SignalTemplate;
