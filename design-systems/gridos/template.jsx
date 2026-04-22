// GRID/OS — Technical · editorial. Mono-forward, visible grid markers, engineering drawing vibe.

function GridOSTemplate({ slide, idx, total, handle, year, pal, fonts, mark }) {
  // Grid crosshairs in corners + corner rules — subtle, like a CAD page
  const corners = (
    <>
      {[[48,48],[SLIDE_W-48,48],[48,SLIDE_H-48],[SLIDE_W-48,SLIDE_H-48]].map(([x,y],i)=>(
        <svg key={i} width="16" height="16" viewBox="0 0 16 16" style={{ position:'absolute', left:x-8, top:y-8 }}>
          <line x1="0" y1="8" x2="16" y2="8" stroke={pal.muted} strokeWidth="1"/>
          <line x1="8" y1="0" x2="8" y2="16" stroke={pal.muted} strokeWidth="1"/>
        </svg>
      ))}
    </>
  );

  const chrome = (
    <>
      <div style={{
        position: 'absolute', top: 40, left: 72, right: 72,
        display: 'flex', justifyContent: 'space-between',
        fontFamily: fonts.mono, fontSize: 14, color: pal.muted, letterSpacing: '0.04em',
      }}>
        <span>[ {handle} ]</span>
        <span style={{ color: pal.accent }}>● rec</span>
        <span>p.{String(idx+1).padStart(2,'0')}/{String(total).padStart(2,'0')}</span>
      </div>
      <div style={{ position: 'absolute', top: 72, left: 72, right: 72, height: 1, background: pal.rule }} />
      <div style={{ position: 'absolute', bottom: 72, left: 72, right: 72, height: 1, background: pal.rule }} />
      <div style={{
        position: 'absolute', bottom: 40, left: 72, right: 72,
        display: 'flex', justifyContent: 'space-between',
        fontFamily: fonts.mono, fontSize: 13, color: pal.muted, letterSpacing: '0.06em',
      }}>
        <span>// pour_over.md</span>
        <span>{year}-Q2</span>
        <span>1080×1350</span>
      </div>
    </>
  );

  const wrap = (children) => (
    <div style={{
      width: SLIDE_W, height: SLIDE_H, background: pal.bg, color: pal.ink,
      fontFamily: fonts.body, position: 'relative', overflow: 'hidden',
    }}>
      {corners}{chrome}{children}
    </div>
  );

  if (slide.kind === 'cover') {
    return wrap(
      <>
        <div style={{ position: 'absolute', left: 72, top: 130, right: 72, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: fonts.mono, fontSize: 16, color: pal.muted, letterSpacing: '0.08em' }}>
            ./{slide.eyebrow.toLowerCase().replace(/\W+/g,'_')}
          </div>
          <BrandMark color={pal.accent} size={48} variant={mark} />
        </div>
        <div style={{ position: 'absolute', left: 72, right: 72, top: 260 }}>
          <h1 style={{
            fontFamily: fonts.display, fontWeight: 700, fontSize: 104, lineHeight: 1.0,
            letterSpacing: '-0.035em', margin: 0, textWrap: 'balance',
          }}>
            {slide.title}
            <span style={{ color: pal.accent }}>_</span>
          </h1>
        </div>
        <div style={{ position: 'absolute', left: 72, right: 72, top: 620 }}>
          <div style={{ borderTop: `1px solid ${pal.rule}`, paddingTop: 20, display:'grid', gridTemplateColumns:'140px 1fr', gap: 20, fontFamily: fonts.mono, fontSize: 16, color: pal.muted }}>
            <span>eyebrow</span><span style={{ color: pal.ink }}>{slide.eyebrow}</span>
            <span>kicker</span><span style={{ color: pal.ink }}>{slide.kicker}</span>
            <span>author</span><span style={{ color: pal.ink }}>{handle}</span>
            <span>issued</span><span style={{ color: pal.ink }}>{year}</span>
          </div>
        </div>
        <div style={{ position: 'absolute', left: 72, right: 72, bottom: 170 }}>
          <div style={{
            padding: 20, background: pal.accent, color: pal.bg,
            fontFamily: fonts.mono, fontSize: 20, lineHeight: 1.4,
          }}>
            $ {slide.subtitle}
          </div>
        </div>
      </>
    );
  }

  if (slide.kind === 'intro') {
    return wrap(
      <>
        <div style={{ position: 'absolute', left: 72, top: 140, right: 72, fontFamily: fonts.mono, fontSize: 14, color: pal.accent, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          §01 · {slide.eyebrow}
        </div>
        <div style={{ position: 'absolute', left: 72, right: 72, top: 240 }}>
          <h2 style={{
            fontFamily: fonts.display, fontWeight: 700, fontSize: 92, lineHeight: 1.02,
            letterSpacing: '-0.03em', margin: 0, textWrap: 'balance',
          }}>{slide.title}</h2>
        </div>
        <div style={{ position: 'absolute', left: 72, right: 72, top: 720, borderTop: `1px solid ${pal.rule}`, paddingTop: 28 }}>
          <div style={{ fontFamily: fonts.mono, fontSize: 13, color: pal.muted, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 18 }}>
            /* abstract */
          </div>
          <div style={{ fontSize: 28, lineHeight: 1.45, maxWidth: 880 }}>
            {slide.body}
          </div>
          <div style={{ marginTop: 28, fontFamily: fonts.mono, fontSize: 14, color: pal.muted }}>
            ≈ {slide.meta}
          </div>
        </div>
      </>
    );
  }

  if (slide.kind === 'numbered') {
    return wrap(
      <>
        <div style={{ position: 'absolute', left: 72, top: 140, fontFamily: fonts.mono, fontSize: 14, color: pal.muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          principle.{slide.number}
        </div>
        <div style={{ position: 'absolute', left: 72, right: 72, top: 220, display:'grid', gridTemplateColumns:'320px 1fr', gap: 40, alignItems: 'start' }}>
          <div style={{
            fontFamily: fonts.mono, fontSize: 280, lineHeight: 0.9, color: pal.accent, letterSpacing: '-0.04em',
          }}>{slide.number}</div>
          <div style={{ paddingTop: 20 }}>
            <div style={{ fontFamily: fonts.mono, fontSize: 13, color: pal.muted, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
              {slide.label}
            </div>
            <h2 style={{
              fontFamily: fonts.display, fontWeight: 700, fontSize: 72, lineHeight: 1.02,
              letterSpacing: '-0.03em', margin: '20px 0 0', textWrap: 'balance',
            }}>{slide.title}</h2>
          </div>
        </div>
        <div style={{ position: 'absolute', left: 72, right: 72, bottom: 200, borderTop: `1px solid ${pal.rule}`, paddingTop: 28 }}>
          <div style={{ fontSize: 26, lineHeight: 1.5, maxWidth: 880 }}>
            {slide.body}
          </div>
        </div>
      </>
    );
  }

  if (slide.kind === 'stat') {
    return wrap(
      <>
        <div style={{ position: 'absolute', left: 72, top: 140, fontFamily: fonts.mono, fontSize: 14, color: pal.muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          metric.median_pour_time
        </div>
        <div style={{ position: 'absolute', left: 72, right: 72, top: 260 }}>
          <div style={{ fontFamily: fonts.mono, fontSize: 13, color: pal.accent, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10 }}>
            /* output */
          </div>
          <div style={{
            fontFamily: fonts.mono, fontWeight: 700, fontSize: 340, lineHeight: 0.88,
            color: pal.ink, letterSpacing: '-0.05em',
          }}>
            {String(slide.big || '').includes(':') ? (
              <>
                <span>{slide.big.split(':')[0]}</span>
                <span style={{ color: pal.accent }}>:</span>
                <span>{slide.big.split(':')[1]}</span>
              </>
            ) : (
              <span>{slide.big}</span>
            )}
          </div>
          <div style={{ marginTop: 10, fontFamily: fonts.mono, fontSize: 20, color: pal.muted, letterSpacing: '0.1em' }}>
            → unit = {slide.unit}
          </div>
        </div>
        <div style={{ position: 'absolute', left: 72, right: 72, bottom: 180, borderTop: `1px solid ${pal.rule}`, paddingTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
          <div style={{ fontSize: 22, lineHeight: 1.5 }}>{slide.caption}</div>
          <div style={{ fontFamily: fonts.mono, fontSize: 14, color: pal.muted, letterSpacing: '0.04em' }}>
            // note<br />{slide.footnote}
          </div>
        </div>
      </>
    );
  }

  if (slide.kind === 'list') {
    return wrap(
      <>
        <div style={{ position: 'absolute', left: 72, top: 140, fontFamily: fonts.mono, fontSize: 14, color: pal.muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          $ ls ./toolkit
        </div>
        <div style={{ position: 'absolute', left: 72, right: 72, top: 210 }}>
          <h2 style={{
            fontFamily: fonts.display, fontWeight: 700, fontSize: 72, lineHeight: 1.02,
            letterSpacing: '-0.03em', margin: 0, textWrap: 'balance',
          }}>{slide.title}</h2>
        </div>
        <div style={{ position: 'absolute', left: 72, right: 72, top: 420, background: pal.bg }}>
          <div style={{ borderTop: `1px solid ${pal.rule}`, borderBottom: `1px solid ${pal.rule}`, fontFamily: fonts.mono, fontSize: 13, color: pal.muted, display:'grid', gridTemplateColumns:'80px 220px 1fr 140px', padding: '14px 0', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            <span>#</span><span>kind</span><span>value</span><span style={{ textAlign:'right' }}>status</span>
          </div>
          {slide.items.map((it, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '80px 220px 1fr 140px', alignItems: 'baseline',
              padding: '24px 0', borderBottom: `1px solid ${pal.rule}`,
              fontFamily: fonts.mono, fontSize: 20, color: pal.ink,
            }}>
              <span style={{ color: pal.accent }}>{it.n}</span>
              <span style={{ color: pal.muted, textTransform:'uppercase', fontSize: 14, letterSpacing: '0.12em' }}>{it.label}</span>
              <span style={{ fontFamily: fonts.display, fontWeight: 500, fontSize: 28 }}>{it.v}</span>
              <span style={{ textAlign:'right', color: pal.accent, fontSize: 14 }}>[ok]</span>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (slide.kind === 'image') {
    return wrap(
      <>
        <div style={{ position: 'absolute', left: 72, top: 140, fontFamily: fonts.mono, fontSize: 14, color: pal.muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          fig.02 — bloom_stage
        </div>
        <div style={{ position: 'absolute', left: 72, right: 72, top: 200 }}>
          <ImgSlot label={slide.imageLabel} color={pal.ink} bg={pal.bg} mono={fonts.mono} aspect="4/3" />
        </div>
        <div style={{ position: 'absolute', left: 72, right: 72, bottom: 190 }}>
          <h2 style={{
            fontFamily: fonts.display, fontWeight: 700, fontSize: 60, lineHeight: 1.02,
            letterSpacing: '-0.03em', margin: 0,
          }}>{slide.title}</h2>
          <div style={{ marginTop: 18, fontSize: 22, lineHeight: 1.45, maxWidth: 820 }}>
            {slide.caption}
          </div>
        </div>
      </>
    );
  }

  if (slide.kind === 'cta') {
    return wrap(
      <>
        <div style={{ position: 'absolute', left: 72, top: 140, fontFamily: fonts.mono, fontSize: 14, color: pal.accent, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          // EOF
        </div>
        <div style={{ position: 'absolute', left: 72, right: 72, top: 360 }}>
          <h2 style={{
            fontFamily: fonts.display, fontWeight: 700, fontSize: 96, lineHeight: 1.02,
            letterSpacing: '-0.035em', margin: 0, textWrap: 'balance',
          }}>{slide.title}</h2>
          <div style={{ marginTop: 40, fontSize: 26, lineHeight: 1.5, maxWidth: 840 }}>
            {slide.body}
          </div>
        </div>
        <div style={{ position: 'absolute', left: 72, right: 72, bottom: 180, borderTop: `1px solid ${pal.rule}`, paddingTop: 30 }}>
          <div style={{ display:'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div style={{ padding: 24, border: `1px solid ${pal.ink}`, fontFamily: fonts.mono, fontSize: 18 }}>
              <div style={{ color: pal.muted, fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>action_01</div>
              ♥ {slide.handleCta}
            </div>
            <div style={{ padding: 24, background: pal.accent, color: pal.bg, fontFamily: fonts.mono, fontSize: 18 }}>
              <div style={{ opacity: 0.7, fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>action_02</div>
              ⌇ {slide.saveCta}
            </div>
          </div>
        </div>
      </>
    );
  }

  return wrap(<div />);
}

window.GridOSTemplate = GridOSTemplate;
