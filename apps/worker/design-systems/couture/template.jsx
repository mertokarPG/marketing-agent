// COUTURE — Ultra-thin luxury magazine. Huge didone serif, generous whitespace, gold accents.

function CoutureTemplate({ slide, idx, total, handle, year, pal, fonts, mark }) {
  const chrome = (
    <>
      <div style={{ position:'absolute', top: 56, left: 80, right: 80, display:'flex', justifyContent:'space-between', alignItems:'baseline', fontFamily: fonts.body, fontSize: 11, color: pal.ink, letterSpacing: '0.32em', textTransform: 'uppercase', fontWeight: 300 }}>
          <span>{handle}</span>
          <span style={{ fontFamily: fonts.display, fontStyle:'italic', fontSize: 20, letterSpacing: '0.04em', textTransform:'none' }}>Maison · {String(idx+1).padStart(2,'0')}</span>
          <span>Édition · {year}</span>
      </div>
      <div style={{ position:'absolute', top: 100, left: 80, right: 80, height: 1, background: pal.rule }}/>
      <div style={{ position:'absolute', bottom: 100, left: 80, right: 80, height: 1, background: pal.rule }}/>
      <div style={{ position:'absolute', bottom: 56, left: 80, right: 80, display:'flex', justifyContent:'space-between', fontFamily: fonts.body, fontSize: 10, color: pal.muted, letterSpacing: '0.36em', textTransform: 'uppercase', fontWeight: 300 }}>
        <span>pour-over · field guide</span>
        <span>— {String(idx+1).padStart(2,'0')} / {String(total).padStart(2,'0')} —</span>
        <span>couture de café</span>
      </div>
    </>
  );
  const wrap = (children) => (
    <div style={{ width: SLIDE_W, height: SLIDE_H, background: pal.bg, color: pal.ink, fontFamily: fonts.body, position:'relative', overflow:'hidden' }}>{chrome}{children}</div>
  );

  if (slide.kind === 'cover') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 80, top: 220, right: 80, textAlign:'center' }}>
          <div style={{ fontFamily: fonts.body, fontSize: 11, letterSpacing: '0.5em', textTransform: 'uppercase', color: pal.accent, marginBottom: 50, fontWeight: 400 }}>
            — {slide.kicker} —
          </div>
        </div>
        <div style={{ position:'absolute', left: 40, right: 40, top: 340, textAlign:'center' }}>
          <div style={{ fontFamily: fonts.display, fontWeight: 300, fontSize: 172, lineHeight: 0.98, letterSpacing: '-0.02em', textWrap: 'balance', fontStyle:'italic', margin: 0 }}>
            {String(slide.title || '').split(/\s+/).filter(Boolean).map((w, i, arr) => (
              <span key={i} style={{ color: i === Math.floor(arr.length / 2) ? pal.accent : pal.ink, fontWeight: i === Math.floor(arr.length / 2) ? 400 : 300 }}>{w}{' '}</span>
            ))}
          </div>
        </div>
        <div style={{ position:'absolute', left: 180, right: 180, bottom: 200, textAlign:'center', fontFamily: fonts.display, fontStyle:'italic', fontSize: 28, lineHeight: 1.45, fontWeight: 400, letterSpacing: '-0.01em' }}>
          «&nbsp;{slide.subtitle}&nbsp;»
        </div>
      </>
    );
  }

  if (slide.kind === 'intro') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 0, right: 0, top: 220, textAlign:'center', fontFamily: fonts.body, fontSize: 11, letterSpacing: '0.5em', textTransform:'uppercase', color: pal.accent, fontWeight: 400 }}>
          — I · {slide.eyebrow} —
        </div>
        <div style={{ position:'absolute', left: 80, right: 80, top: 320, textAlign:'center' }}>
          <h2 style={{ fontFamily: fonts.display, fontStyle:'italic', fontWeight: 300, fontSize: 140, lineHeight: 1.02, letterSpacing: '-0.025em', margin: 0, textWrap:'balance' }}>
            {slide.title}
          </h2>
        </div>
        <div style={{ position:'absolute', left: 200, right: 200, bottom: 230, textAlign:'center', fontSize: 22, lineHeight: 1.7, fontWeight: 300 }}>
          {slide.body}
          <div style={{ marginTop: 30, fontFamily: fonts.body, fontSize: 11, letterSpacing: '0.36em', textTransform:'uppercase', color: pal.accent, fontWeight: 400 }}>
            — {slide.meta} —
          </div>
        </div>
      </>
    );
  }

  if (slide.kind === 'numbered') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 0, right: 0, top: 210, textAlign:'center', fontFamily: fonts.display, fontStyle:'italic', fontWeight: 300, fontSize: 60, color: pal.accent }}>
          n° {slide.number}
        </div>
        <div style={{ position:'absolute', left: 0, right: 0, top: 320, textAlign:'center', fontFamily: fonts.body, fontSize: 11, letterSpacing: '0.5em', textTransform:'uppercase', color: pal.muted, fontWeight: 400 }}>
          — {slide.label} —
        </div>
        <div style={{ position:'absolute', left: 80, right: 80, top: 400, textAlign:'center' }}>
          <h2 style={{ fontFamily: fonts.display, fontStyle:'italic', fontWeight: 300, fontSize: 140, lineHeight: 1.0, letterSpacing: '-0.025em', margin: 0, textWrap:'balance' }}>
            {slide.title}
          </h2>
        </div>
        <div style={{ position:'absolute', left: 200, right: 200, bottom: 220, textAlign:'center', fontSize: 22, lineHeight: 1.7, fontWeight: 300 }}>
          {slide.body}
        </div>
      </>
    );
  }

  if (slide.kind === 'stat') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 0, right: 0, top: 220, textAlign:'center', fontFamily: fonts.body, fontSize: 11, letterSpacing: '0.5em', textTransform:'uppercase', color: pal.accent, fontWeight: 400 }}>
          — observed —
        </div>
        <div style={{ position:'absolute', left: 0, right: 0, top: 320, textAlign:'center', fontFamily: fonts.display, fontWeight: 300, fontSize: 540, lineHeight: 0.88, letterSpacing: '-0.04em', fontStyle:'italic' }}>
          {slide.big}
        </div>
        <div style={{ position:'absolute', left: 0, right: 0, top: 920, textAlign:'center', fontFamily: fonts.body, fontSize: 14, letterSpacing: '0.5em', textTransform:'uppercase', color: pal.muted, fontWeight: 400 }}>
          — {slide.unit} —
        </div>
        <div style={{ position:'absolute', left: 200, right: 200, bottom: 220, textAlign:'center', fontSize: 20, lineHeight: 1.7, fontWeight: 300 }}>
          {slide.caption}
          <div style={{ marginTop: 16, fontFamily: fonts.display, fontStyle:'italic', fontSize: 18, color: pal.muted }}>{slide.footnote}</div>
        </div>
      </>
    );
  }

  if (slide.kind === 'list') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 0, right: 0, top: 220, textAlign:'center' }}>
          <div style={{ fontFamily: fonts.body, fontSize: 11, letterSpacing: '0.5em', textTransform:'uppercase', color: pal.accent, fontWeight: 400 }}>— l'Atelier —</div>
          <h2 style={{ fontFamily: fonts.display, fontStyle:'italic', fontWeight: 300, fontSize: 88, lineHeight: 1.05, margin: '28px 0 0', letterSpacing: '-0.02em' }}>{slide.title}</h2>
        </div>
        <div style={{ position:'absolute', left: 200, right: 200, top: 520 }}>
          {slide.items.map((it, i) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'60px 1fr 1fr', padding:'20px 0', borderBottom: `1px solid ${pal.rule}`, alignItems:'baseline' }}>
              <div style={{ fontFamily: fonts.display, fontStyle:'italic', fontSize: 26, color: pal.accent, fontWeight: 300 }}>{it.n}</div>
              <div style={{ fontFamily: fonts.body, fontSize: 11, letterSpacing: '0.3em', textTransform:'uppercase', color: pal.muted, fontWeight: 400 }}>{it.label}</div>
              <div style={{ fontFamily: fonts.display, fontStyle:'italic', fontWeight: 300, fontSize: 36, letterSpacing: '-0.015em', textAlign:'right' }}>{it.v}</div>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (slide.kind === 'image') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 300, right: 300, top: 180 }}>
          <ImgSlot label={slide.imageLabel} src={slide.imageSrc} color={pal.ink} bg={pal.bg} mono={fonts.mono} aspect="2/3" />
          <div style={{ textAlign:'center', marginTop: 14, fontFamily: fonts.body, fontSize: 10, letterSpacing: '0.4em', textTransform:'uppercase', color: pal.muted, fontWeight: 400 }}>
            — Plate II —
          </div>
        </div>
        <div style={{ position:'absolute', left: 80, right: 80, bottom: 140, textAlign:'center' }}>
          <h2 style={{ fontFamily: fonts.display, fontStyle:'italic', fontWeight: 300, fontSize: 54, margin: 0, letterSpacing: '-0.015em', color: pal.accent }}>
            {slide.title}
          </h2>
          <div style={{ marginTop: 16, fontSize: 19, lineHeight: 1.7, fontWeight: 300, maxWidth: 640, margin: '16px auto 0' }}>
            {slide.caption}
          </div>
        </div>
      </>
    );
  }

  if (slide.kind === 'cta') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 0, right: 0, top: 300, textAlign:'center', fontFamily: fonts.body, fontSize: 11, letterSpacing: '0.5em', textTransform:'uppercase', color: pal.accent, fontWeight: 400 }}>
          — épilogue —
        </div>
        <div style={{ position:'absolute', left: 0, right: 0, top: 420, textAlign:'center' }}>
          <h2 style={{ fontFamily: fonts.display, fontStyle:'italic', fontWeight: 300, fontSize: 128, lineHeight: 1.04, margin: 0, letterSpacing: '-0.03em', textWrap:'balance', padding: '0 80px' }}>
            {String(slide.title || '').split(/\s+/).filter(Boolean).map((w, i, arr) => (
              <span key={i} style={{ color: i === arr.length - 1 ? pal.accent : pal.ink }}>{w}{' '}</span>
            ))}
          </h2>
        </div>
        <div style={{ position:'absolute', left: 200, right: 200, bottom: 200, textAlign:'center' }}>
          <div style={{ fontSize: 20, lineHeight: 1.7, fontWeight: 300 }}>{slide.body}</div>
          <div style={{ marginTop: 30, display:'inline-flex', gap: 40, fontFamily: fonts.body, fontSize: 11, letterSpacing: '0.36em', textTransform:'uppercase', fontWeight: 400 }}>
            <span>♥ {slide.handleCta}</span>
            <span style={{ color: pal.rule }}>·</span>
            <span style={{ color: pal.accent }}>⌇ {slide.saveCta}</span>
          </div>
        </div>
      </>
    );
  }
  return wrap(<div />);
}
window.CoutureTemplate = CoutureTemplate;
