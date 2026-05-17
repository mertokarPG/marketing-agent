// NOCTURNE — Avant-garde · dark (but supports light via palette). Experimental scale, rotated type, overlays.

function NocturneTemplate({ slide, idx, total, handle, year, pal, fonts, mark }) {
  const chrome = (
    <>
      <div style={{
        position: 'absolute', top: 40, left: 56, right: 56,
        display: 'flex', justifyContent: 'space-between',
        fontFamily: fonts.mono, fontSize: 13, color: pal.muted, letterSpacing: '0.12em', textTransform: 'uppercase',
      }}>
        <span>{handle}</span>
        <span>{String(idx+1).padStart(2,'0')} ░ {String(total).padStart(2,'0')}</span>
        <span>{year}</span>
      </div>
      <div style={{
        position: 'absolute', bottom: 40, left: 56, right: 56,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontFamily: fonts.mono, fontSize: 13, color: pal.muted, letterSpacing: '0.12em', textTransform: 'uppercase',
      }}>
        <span style={{ color: pal.accent }}>● transmission</span>
        <span style={{ display:'inline-flex', gap: 8 }}>
          {Array.from({length: total}).map((_,i)=>(<span key={i} style={{ width: i===idx?18:6, height:2, background: i===idx?pal.accent:pal.rule, transition:'all .3s' }}/>))}
        </span>
        <span>swipe</span>
      </div>
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
        <div style={{ position: 'absolute', left: 56, top: 130, right: 56, display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div style={{ fontFamily: fonts.mono, fontSize: 14, letterSpacing: '0.2em', textTransform: 'uppercase', color: pal.accent, lineHeight: 1.6 }}>
            {slide.eyebrow}<br/>
            <span style={{ color: pal.muted }}>{slide.kicker}</span>
          </div>
          <BrandMark color={pal.accent} size={56} variant={mark} />
        </div>
        <div style={{ position: 'absolute', left: 56, right: 56, top: 240 }}>
          <h1 style={{
            fontFamily: fonts.display, fontWeight: 800, fontSize: 156, lineHeight: 0.9,
            letterSpacing: '-0.05em', margin: 0, textWrap: 'balance',
          }}>
            {String(slide.title || '').split(/\s+/).filter(Boolean).map((w, i, arr) => (
              <span key={i} style={i === arr.length - 1 ? {
                WebkitTextStroke: `2px ${pal.accent}`, color: 'transparent',
              } : {}}>{w}{' '}</span>
            ))}
          </h1>
        </div>
        <div style={{
          position: 'absolute', left: 680, top: 680, transform:'rotate(-90deg)', transformOrigin:'top left',
          fontFamily: fonts.mono, fontSize: 14, letterSpacing: '0.4em', textTransform: 'uppercase', color: pal.muted,
        }}>
          a quiet ritual · field guide № 04
        </div>
        <div style={{ position: 'absolute', left: 56, right: 320, top: 920 }}>
          <div style={{ fontFamily: fonts.display, fontSize: 42, lineHeight: 1.15, letterSpacing: '-0.02em', fontWeight: 400, textWrap: 'balance' }}>
            {slide.subtitle}
          </div>
        </div>
      </>
    );
  }

  if (slide.kind === 'intro') {
    return wrap(
      <>
        <div style={{ position: 'absolute', left: 56, top: 140, fontFamily: fonts.mono, fontSize: 14, letterSpacing: '0.2em', textTransform: 'uppercase', color: pal.accent }}>
          § {slide.eyebrow}
        </div>
        <div style={{ position: 'absolute', left: 56, right: 56, top: 240 }}>
          <h2 style={{
            fontFamily: fonts.display, fontWeight: 800, fontSize: 140, lineHeight: 0.92,
            letterSpacing: '-0.045em', margin: 0, textWrap: 'balance',
          }}>{slide.title}</h2>
        </div>
        <div style={{ position: 'absolute', left: 56, right: 56, bottom: 200 }}>
          <div style={{
            fontSize: 30, lineHeight: 1.4, maxWidth: 880,
            paddingLeft: 26, borderLeft: `4px solid ${pal.accent}`,
          }}>
            {slide.body}
          </div>
          <div style={{ marginTop: 24, fontFamily: fonts.mono, fontSize: 14, color: pal.muted, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            → {slide.meta}
          </div>
        </div>
      </>
    );
  }

  if (slide.kind === 'numbered') {
    return wrap(
      <>
        <div style={{
          position: 'absolute', left: -40, top: 80,
          fontFamily: fonts.display, fontWeight: 800, fontSize: 860, lineHeight: 0.82,
          color: hexWithAlpha(pal.accent, 0.18), letterSpacing: '-0.08em',
        }}>{slide.number}</div>
        <div style={{ position: 'absolute', left: 56, top: 180, fontFamily: fonts.mono, fontSize: 14, letterSpacing: '0.2em', textTransform: 'uppercase', color: pal.accent }}>
          {slide.label} · {slide.number}
        </div>
        <div style={{ position: 'absolute', left: 56, right: 56, top: 720 }}>
          <h2 style={{
            fontFamily: fonts.display, fontWeight: 800, fontSize: 104, lineHeight: 0.96,
            letterSpacing: '-0.04em', margin: 0, textWrap: 'balance',
          }}>{slide.title}</h2>
          <div style={{ marginTop: 40, fontSize: 26, lineHeight: 1.5, maxWidth: 900 }}>
            {slide.body}
          </div>
        </div>
      </>
    );
  }

  if (slide.kind === 'stat') {
    return wrap(
      <>
        <div style={{ position: 'absolute', left: 56, top: 140, fontFamily: fonts.mono, fontSize: 14, letterSpacing: '0.2em', textTransform: 'uppercase', color: pal.accent }}>
          Observed metric
        </div>
        <div style={{
          position: 'absolute', left: 40, right: 40, top: 300, textAlign:'center',
          fontFamily: fonts.display, fontWeight: 800, fontSize: 440, lineHeight: 0.88,
          letterSpacing: '-0.05em', color: pal.ink,
        }}>
          {String(slide.big || '').includes(':') ? (
            <>
              <span>{slide.big.split(':')[0]}</span>
              <span style={{ color: pal.accent }}>:</span>
              <span style={{ WebkitTextStroke: `3px ${pal.ink}`, color: 'transparent' }}>{slide.big.split(':')[1]}</span>
            </>
          ) : (
            <span>{slide.big}</span>
          )}
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, bottom: 230, display:'grid', gridTemplateColumns: '1fr 1fr', gap: 40, alignItems:'flex-end' }}>
          <div style={{ fontFamily: fonts.mono, fontSize: 18, letterSpacing: '0.18em', textTransform: 'uppercase', color: pal.accent }}>
            unit · {slide.unit}
          </div>
          <div style={{ fontSize: 22, lineHeight: 1.5 }}>
            {slide.caption}<br/><br/>
            <span style={{ fontFamily: fonts.mono, fontSize: 13, color: pal.muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {slide.footnote}
            </span>
          </div>
        </div>
      </>
    );
  }

  if (slide.kind === 'list') {
    return wrap(
      <>
        <div style={{ position: 'absolute', left: 56, right: 56, top: 130 }}>
          <h2 style={{
            fontFamily: fonts.display, fontWeight: 800, fontSize: 84, lineHeight: 0.98,
            letterSpacing: '-0.035em', margin: 0, textWrap: 'balance',
          }}>{slide.title}</h2>
        </div>
        <div style={{ position: 'absolute', left: 56, right: 56, top: 380 }}>
          {slide.items.map((it, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '100px 1fr auto', alignItems: 'center',
              padding: '22px 0',
              borderBottom: `1px solid ${pal.rule}`,
              position: 'relative',
            }}>
              <div style={{ fontFamily: fonts.mono, fontSize: 18, color: pal.accent, letterSpacing: '0.1em' }}>{it.n}</div>
              <div style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 44, letterSpacing: '-0.025em' }}>
                {it.v}
              </div>
              <div style={{ fontFamily: fonts.mono, fontSize: 14, letterSpacing: '0.14em', textTransform: 'uppercase', color: pal.muted }}>
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
        <div style={{ position: 'absolute', left: 56, top: 140, right: 56 }}>
          <ImgSlot label={slide.imageLabel} src={slide.imageSrc} color={pal.ink} bg={pal.bg} mono={fonts.mono} aspect="1/1" />
        </div>
        <div style={{
          position: 'absolute', left: 56, right: 56, top: 620,
          fontFamily: fonts.display, fontWeight: 800, fontSize: 160, lineHeight: 0.88,
          letterSpacing: '-0.05em', color: pal.accent, mixBlendMode: 'difference',
          textTransform: 'lowercase', pointerEvents: 'none',
        }}>
          {slide.title}.
        </div>
        <div style={{ position: 'absolute', left: 56, right: 56, bottom: 180 }}>
          <div style={{ fontSize: 24, lineHeight: 1.5, maxWidth: 820, paddingLeft: 22, borderLeft: `4px solid ${pal.accent}` }}>
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
          position: 'absolute', left: 56, right: 56, top: 260, textAlign: 'center',
          fontFamily: fonts.display, fontWeight: 800, fontSize: 156, lineHeight: 0.92,
          letterSpacing: '-0.045em', textTransform: 'uppercase', textWrap: 'balance',
        }}>
          {String(slide.title || '').split(/\s+/).filter(Boolean).map((w, i, arr) => (
            <span key={i} style={i === arr.length - 1 ? {
              WebkitTextStroke: `3px ${pal.accent}`, color: 'transparent',
            } : {}}>{w}{' '}</span>
          ))}
        </div>
        <div style={{ position: 'absolute', left: 56, right: 56, bottom: 180 }}>
          <div style={{ fontSize: 24, lineHeight: 1.45, maxWidth: 740 }}>{slide.body}</div>
          <div style={{ marginTop: 28, display: 'flex', gap: 14, fontFamily: fonts.mono, fontSize: 14, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            <span style={{ padding: '14px 22px', border: `1px solid ${pal.ink}` }}>♥ {slide.handleCta}</span>
            <span style={{ padding: '14px 22px', background: pal.accent, color: pal.bg }}>⌇ {slide.saveCta}</span>
          </div>
        </div>
      </>
    );
  }

  return wrap(<div />);
}

window.NocturneTemplate = NocturneTemplate;
