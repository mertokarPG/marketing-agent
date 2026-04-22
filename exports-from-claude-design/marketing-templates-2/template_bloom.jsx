// BLOOM — Warm · approachable. Rounded, playful, soft corners, ribbon accents.

function BloomTemplate({ slide, idx, total, handle, year, pal, fonts, mark }) {
  const chrome = (
    <>
      <div style={{
        position: 'absolute', top: 40, left: 56, right: 56,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontFamily: fonts.body, fontSize: 16, color: pal.ink,
      }}>
        <span style={{ display:'inline-flex', alignItems:'center', gap: 10 }}>
          <BrandMark color={pal.accent} size={28} variant={mark} />
          <span style={{ fontWeight: 500 }}>{handle}</span>
        </span>
        <span style={{ padding: '6px 16px', background: pal.accent, color: pal.bg, borderRadius: 999, fontFamily: fonts.mono, fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Vol. {String(idx+1).padStart(2,'0')}
        </span>
        <span style={{ color: pal.muted, fontVariantNumeric: 'tabular-nums' }}>{year}</span>
      </div>
      <PageDots total={total} idx={idx} pal={pal} />
    </>
  );
  const wrap = (children) => (
    <div style={{
      width: SLIDE_W, height: SLIDE_H, background: pal.bg, color: pal.ink,
      fontFamily: fonts.body, position: 'relative', overflow: 'hidden',
    }}>
      {chrome}{children}
    </div>
  );

  if (slide.kind === 'cover') {
    return wrap(
      <>
        <div style={{ position: 'absolute', left: 56, top: 160 }}>
          <span style={{ padding: '10px 20px', border: `2px solid ${pal.accent}`, color: pal.accent, borderRadius: 999, fontFamily: fonts.mono, fontSize: 14, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            · {slide.kicker} ·
          </span>
        </div>
        <div style={{ position: 'absolute', left: 56, right: 56, top: 320 }}>
          <h1 style={{
            fontFamily: fonts.display, fontWeight: 400, fontSize: 150, lineHeight: 0.95,
            letterSpacing: '-0.03em', margin: 0, color: pal.ink, textWrap: 'balance',
          }}>
            The quiet <span style={{ color: pal.accent }}>ritual</span> of pour-over.
          </h1>
        </div>
        <div style={{ position: 'absolute', left: 56, right: 300, bottom: 220 }}>
          <div style={{ fontSize: 26, lineHeight: 1.4, color: pal.ink }}>
            {slide.subtitle}
          </div>
        </div>
        <div style={{
          position: 'absolute', bottom: 220, right: 56,
          width: 120, height: 120, borderRadius: '50%',
          background: pal.accent, color: pal.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: fonts.display, fontSize: 28, transform: 'rotate(-12deg)',
        }}>Swipe →</div>
      </>
    );
  }

  if (slide.kind === 'intro') {
    return wrap(
      <>
        <div style={{ position: 'absolute', left: 56, top: 160 }}>
          <span style={{ padding: '8px 18px', background: pal.accent, color: pal.bg, borderRadius: 999, fontFamily: fonts.mono, fontSize: 13, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            {slide.eyebrow}
          </span>
        </div>
        <div style={{ position: 'absolute', left: 56, right: 56, top: 280 }}>
          <h2 style={{
            fontFamily: fonts.display, fontWeight: 400, fontSize: 110, lineHeight: 0.98,
            letterSpacing: '-0.03em', margin: 0, textWrap: 'balance',
          }}>{slide.title}</h2>
        </div>
        <div style={{ position: 'absolute', left: 56, right: 56, bottom: 220 }}>
          <div style={{
            padding: 36, background: hexWithAlpha(pal.accent, 0.12), borderRadius: 24,
            fontSize: 26, lineHeight: 1.45, maxWidth: 840,
          }}>
            {slide.body}
          </div>
          <div style={{ marginTop: 20, fontFamily: fonts.mono, fontSize: 15, color: pal.accent, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            ⏱ {slide.meta}
          </div>
        </div>
      </>
    );
  }

  if (slide.kind === 'numbered') {
    return wrap(
      <>
        <div style={{ position: 'absolute', left: 56, top: 160, display:'flex', alignItems: 'center', gap: 20 }}>
          <div style={{
            width: 120, height: 120, borderRadius: '50%', background: pal.accent, color: pal.bg,
            display:'flex', alignItems:'center', justifyContent:'center',
            fontFamily: fonts.display, fontSize: 64,
          }}>{slide.number}</div>
          <div style={{ fontFamily: fonts.mono, fontSize: 15, color: pal.muted, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            {slide.label}
          </div>
        </div>
        <div style={{ position: 'absolute', left: 56, right: 56, top: 360 }}>
          <h2 style={{
            fontFamily: fonts.display, fontWeight: 400, fontSize: 104, lineHeight: 0.98,
            letterSpacing: '-0.03em', margin: 0, textWrap: 'balance',
          }}>{slide.title}</h2>
        </div>
        <div style={{ position: 'absolute', left: 56, right: 56, bottom: 200 }}>
          <div style={{
            padding: '32px 36px', borderRadius: 24, background: pal.ink, color: pal.bg,
            fontSize: 26, lineHeight: 1.45, maxWidth: 900,
          }}>
            {slide.body}
          </div>
        </div>
      </>
    );
  }

  if (slide.kind === 'stat') {
    return wrap(
      <>
        <div style={{ position: 'absolute', left: 56, right: 56, top: 260, textAlign: 'center' }}>
          <div style={{ fontFamily: fonts.mono, fontSize: 16, letterSpacing: '0.18em', textTransform: 'uppercase', color: pal.muted, marginBottom: 30 }}>
            A single measurement
          </div>
          <div style={{
            fontFamily: fonts.display, fontWeight: 400, fontSize: 480, lineHeight: 0.9,
            color: pal.accent, letterSpacing: '-0.04em',
          }}>{slide.big}</div>
          <div style={{ fontFamily: fonts.mono, fontSize: 22, letterSpacing: '0.2em', textTransform: 'uppercase', color: pal.ink, marginTop: 10 }}>
            {slide.unit}
          </div>
        </div>
        <div style={{ position: 'absolute', left: 100, right: 100, bottom: 220 }}>
          <div style={{
            padding: '32px 40px', borderRadius: 28, background: pal.ink, color: pal.bg,
            textAlign: 'center', fontSize: 24, lineHeight: 1.45,
          }}>
            {slide.caption}
          </div>
          <div style={{ textAlign:'center', marginTop: 16, fontFamily: fonts.mono, fontSize: 14, color: pal.muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {slide.footnote}
          </div>
        </div>
      </>
    );
  }

  if (slide.kind === 'list') {
    return wrap(
      <>
        <div style={{ position: 'absolute', left: 56, right: 56, top: 160 }}>
          <h2 style={{
            fontFamily: fonts.display, fontWeight: 400, fontSize: 84, lineHeight: 1.0,
            letterSpacing: '-0.03em', margin: 0, textWrap: 'balance',
          }}>{slide.title}</h2>
        </div>
        <div style={{ position: 'absolute', left: 56, right: 56, top: 380, display:'grid', gridTemplateColumns:'1fr 1fr', gap: 20 }}>
          {slide.items.map((it, i) => (
            <div key={i} style={{
              padding: '26px 28px', borderRadius: 22,
              background: i % 3 === 0 ? pal.ink : i % 3 === 1 ? hexWithAlpha(pal.accent, 0.18) : pal.bg,
              color: i % 3 === 0 ? pal.bg : pal.ink,
              border: i % 3 === 2 ? `2px solid ${pal.ink}` : 'none',
              minHeight: 130,
            }}>
              <div style={{ fontFamily: fonts.mono, fontSize: 14, letterSpacing: '0.12em', opacity: 0.7 }}>{it.n} · {it.label.toUpperCase()}</div>
              <div style={{ fontFamily: fonts.display, fontSize: 40, marginTop: 10, letterSpacing: '-0.02em' }}>{it.v}</div>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (slide.kind === 'image') {
    return wrap(
      <>
        <div style={{ position: 'absolute', left: 56, right: 56, top: 140 }}>
          <div style={{ borderRadius: 28, overflow: 'hidden' }}>
            <ImgSlot label={slide.imageLabel} color={pal.ink} bg={pal.bg} mono={fonts.mono} aspect="4/3" />
          </div>
        </div>
        <div style={{ position: 'absolute', left: 56, right: 56, bottom: 170 }}>
          <h2 style={{
            fontFamily: fonts.display, fontWeight: 400, fontSize: 80, lineHeight: 1.02,
            letterSpacing: '-0.03em', margin: 0, color: pal.accent,
          }}>{slide.title}</h2>
          <div style={{
            marginTop: 20, padding: '24px 28px', background: pal.ink, color: pal.bg,
            borderRadius: 20, fontSize: 22, lineHeight: 1.5, maxWidth: 860,
          }}>
            {slide.caption}
          </div>
        </div>
      </>
    );
  }

  if (slide.kind === 'cta') {
    return wrap(
      <>
        <div style={{ position: 'absolute', left: 56, right: 56, top: 400 }}>
          <h2 style={{
            fontFamily: fonts.display, fontWeight: 400, fontSize: 140, lineHeight: 0.96,
            letterSpacing: '-0.035em', margin: 0, color: pal.ink, textWrap: 'balance',
          }}>
            Save this for your next <span style={{ color: pal.accent }}>Sunday.</span>
          </h2>
        </div>
        <div style={{ position: 'absolute', left: 56, right: 56, bottom: 220 }}>
          <div style={{ fontSize: 26, lineHeight: 1.4, maxWidth: 720, color: pal.ink }}>{slide.body}</div>
          <div style={{ marginTop: 32, display: 'flex', gap: 14 }}>
            <div style={{ padding: '20px 30px', borderRadius: 999, background: pal.ink, color: pal.bg, fontFamily: fonts.body, fontWeight: 600, fontSize: 18 }}>
              ♥ {slide.handleCta}
            </div>
            <div style={{ padding: '20px 30px', borderRadius: 999, background: pal.accent, color: pal.bg, fontFamily: fonts.body, fontWeight: 600, fontSize: 18 }}>
              ⌇ {slide.saveCta}
            </div>
          </div>
        </div>
      </>
    );
  }

  return wrap(<div />);
}

window.BloomTemplate = BloomTemplate;
