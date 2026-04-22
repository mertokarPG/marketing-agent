// VAPOR — Soft dream. Gradients, blur, elegant thin serif, pastel blobs.

function VaporTemplate({ slide, idx, total, handle, year, pal, fonts, mark }) {
  const bgGrad = `radial-gradient(ellipse at 20% 20%, ${hexWithAlpha(pal.accent, 0.35)}, transparent 55%), radial-gradient(ellipse at 90% 90%, ${hexWithAlpha(pal.accent, 0.25)}, transparent 55%), ${pal.bg}`;
  const chrome = (
    <>
      <div style={{ position:'absolute', top: 44, left: 56, right: 56, display:'flex', justifyContent:'space-between', alignItems:'center', fontFamily: fonts.body, fontSize: 14, color: pal.muted, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 400 }}>
        <span>{handle}</span>
        <span style={{ fontFamily: fonts.display, fontSize: 22, fontStyle:'italic', color: pal.ink, letterSpacing: 0, textTransform:'none' }}>◌ vol. {String(idx+1).padStart(2,'0')}</span>
        <span>{year}</span>
      </div>
      <div style={{ position:'absolute', bottom: 44, left: 0, right: 0, textAlign:'center', fontFamily: fonts.body, fontSize: 13, color: pal.muted, letterSpacing: '0.22em', textTransform: 'uppercase' }}>
        {String(idx+1).padStart(2,'0')} ⎯ of ⎯ {String(total).padStart(2,'0')}
      </div>
    </>
  );
  const wrap = (children) => (
    <div style={{ width: SLIDE_W, height: SLIDE_H, background: bgGrad, color: pal.ink, fontFamily: fonts.body, position:'relative', overflow:'hidden' }}>{chrome}{children}</div>
  );

  if (slide.kind === 'cover') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: -120, top: 280, width: 420, height: 420, borderRadius:'50%', background: hexWithAlpha(pal.accent, 0.45), filter:'blur(60px)' }} />
        <div style={{ position:'absolute', right: -80, top: 600, width: 380, height: 380, borderRadius:'50%', background: hexWithAlpha(pal.ink, 0.15), filter:'blur(80px)' }} />
        <div style={{ position:'absolute', left: 56, right: 56, top: 320, textAlign:'center' }}>
          <div style={{ fontFamily: fonts.body, fontSize: 14, letterSpacing: '0.3em', textTransform: 'uppercase', color: pal.accent, marginBottom: 28 }}>
            ◌ {slide.kicker}
          </div>
          <h1 style={{ fontFamily: fonts.display, fontWeight: 400, fontSize: 180, lineHeight: 0.96, letterSpacing: '-0.025em', margin: 0, fontStyle:'italic', textWrap:'balance' }}>
            pour<br/>
            <span style={{ color: pal.accent }}>&</span><br/>
            over.
          </h1>
        </div>
        <div style={{ position:'absolute', left: 120, right: 120, bottom: 220, textAlign:'center', fontSize: 22, lineHeight: 1.6, color: pal.ink, fontWeight: 300 }}>
          {slide.subtitle}
        </div>
      </>
    );
  }

  if (slide.kind === 'intro') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 56, right: 56, top: 260, textAlign:'center' }}>
          <div style={{ fontFamily: fonts.body, fontSize: 13, letterSpacing: '0.3em', textTransform: 'uppercase', color: pal.accent }}>— {slide.eyebrow} —</div>
          <h2 style={{ fontFamily: fonts.display, fontWeight: 400, fontSize: 108, lineHeight: 1.02, letterSpacing: '-0.025em', margin: '30px 0 0', fontStyle:'italic', textWrap:'balance' }}>
            {slide.title}
          </h2>
        </div>
        <div style={{ position:'absolute', left: 120, right: 120, bottom: 240 }}>
          <div style={{
            padding: '32px 40px', background: hexWithAlpha(pal.bg, 0.5), backdropFilter:'blur(20px)',
            border: `1px solid ${hexWithAlpha(pal.ink, 0.1)}`, borderRadius: 28,
            fontSize: 22, lineHeight: 1.6, fontWeight: 300, textAlign:'center',
          }}>
            {slide.body}
          </div>
          <div style={{ marginTop: 22, textAlign:'center', fontFamily: fonts.body, fontSize: 13, letterSpacing: '0.22em', textTransform: 'uppercase', color: pal.accent }}>
            ◌ {slide.meta}
          </div>
        </div>
      </>
    );
  }

  if (slide.kind === 'numbered') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 56, top: 200, fontFamily: fonts.display, fontWeight: 400, fontStyle:'italic', fontSize: 320, lineHeight: 0.88, color: pal.accent, letterSpacing: '-0.04em' }}>
          {slide.number}
        </div>
        <div style={{ position:'absolute', right: 56, top: 260, fontFamily: fonts.body, fontSize: 13, letterSpacing: '0.3em', textTransform: 'uppercase', color: pal.muted, textAlign:'right' }}>
          {slide.label}
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, top: 640 }}>
          <h2 style={{ fontFamily: fonts.display, fontWeight: 400, fontSize: 92, lineHeight: 1.02, letterSpacing: '-0.02em', margin: 0, fontStyle:'italic', textWrap:'balance' }}>
            {slide.title}
          </h2>
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, bottom: 200, fontSize: 24, lineHeight: 1.65, fontWeight: 300, maxWidth: 900 }}>
          {slide.body}
        </div>
      </>
    );
  }

  if (slide.kind === 'stat') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: '50%', top: 400, transform:'translate(-50%, 0)', width: 640, height: 640, borderRadius:'50%', background: hexWithAlpha(pal.accent, 0.35), filter:'blur(40px)' }} />
        <div style={{ position:'absolute', left: 0, right: 0, top: 360, textAlign:'center' }}>
          <div style={{ fontFamily: fonts.body, fontSize: 13, letterSpacing: '0.3em', textTransform: 'uppercase', color: pal.muted, marginBottom: 20 }}>
            — Observed —
          </div>
          <div style={{ position:'relative', fontFamily: fonts.display, fontWeight: 400, fontSize: 440, lineHeight: 0.88, letterSpacing: '-0.04em', color: pal.ink, fontStyle:'italic' }}>
            {slide.big}
          </div>
          <div style={{ fontFamily: fonts.body, fontSize: 18, letterSpacing: '0.3em', textTransform: 'uppercase', color: pal.accent, marginTop: 10 }}>
            ◌ {slide.unit}
          </div>
        </div>
        <div style={{ position:'absolute', left: 160, right: 160, bottom: 220, textAlign:'center', fontSize: 22, lineHeight: 1.6, fontWeight: 300 }}>
          {slide.caption}
          <div style={{ marginTop: 12, fontFamily: fonts.body, fontSize: 12, color: pal.muted, letterSpacing: '0.2em', textTransform: 'uppercase' }}>{slide.footnote}</div>
        </div>
      </>
    );
  }

  if (slide.kind === 'list') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 56, right: 56, top: 180, textAlign:'center' }}>
          <h2 style={{ fontFamily: fonts.display, fontWeight: 400, fontSize: 84, lineHeight: 1.0, fontStyle:'italic', margin: 0 }}>{slide.title}</h2>
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, top: 420, display:'grid', gridTemplateColumns:'1fr 1fr', gap: 16 }}>
          {slide.items.map((it, i) => (
            <div key={i} style={{
              padding: '22px 26px', borderRadius: 22,
              background: hexWithAlpha(pal.bg, 0.55), backdropFilter:'blur(20px)',
              border: `1px solid ${hexWithAlpha(pal.accent, 0.2)}`,
              minHeight: 120,
            }}>
              <div style={{ fontFamily: fonts.body, fontSize: 13, letterSpacing: '0.22em', textTransform: 'uppercase', color: pal.accent }}>◌ {it.n}</div>
              <div style={{ fontFamily: fonts.display, fontWeight: 400, fontSize: 40, fontStyle:'italic', letterSpacing: '-0.02em', marginTop: 8 }}>{it.v}</div>
              <div style={{ fontFamily: fonts.body, fontSize: 13, letterSpacing: '0.16em', textTransform: 'uppercase', color: pal.muted, marginTop: 6 }}>{it.label}</div>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (slide.kind === 'image') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 120, right: 120, top: 180, borderRadius: 32, overflow:'hidden', boxShadow: `0 30px 80px ${hexWithAlpha(pal.ink, 0.25)}` }}>
          <ImgSlot label={slide.imageLabel} color={pal.ink} bg={pal.bg} mono={fonts.mono} aspect="3/4" />
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, bottom: 180, textAlign:'center' }}>
          <h2 style={{ fontFamily: fonts.display, fontWeight: 400, fontSize: 56, lineHeight: 1.05, margin: 0, fontStyle:'italic', color: pal.accent }}>
            {slide.title}
          </h2>
          <div style={{ marginTop: 18, fontSize: 20, lineHeight: 1.6, fontWeight: 300, maxWidth: 680, margin: '18px auto 0' }}>
            {slide.caption}
          </div>
        </div>
      </>
    );
  }

  if (slide.kind === 'cta') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: '50%', top: 460, transform:'translate(-50%, 0)', width: 640, height: 640, borderRadius:'50%', background: hexWithAlpha(pal.accent, 0.4), filter:'blur(60px)' }} />
        <div style={{ position:'absolute', left: 56, right: 56, top: 400, textAlign:'center' }}>
          <h2 style={{ fontFamily: fonts.display, fontWeight: 400, fontSize: 130, lineHeight: 1.0, fontStyle:'italic', margin: 0, letterSpacing: '-0.025em', textWrap:'balance' }}>
            Save for a <span style={{ color: pal.accent }}>slower</span> Sunday.
          </h2>
        </div>
        <div style={{ position:'absolute', left: 120, right: 120, bottom: 220, textAlign:'center' }}>
          <div style={{ fontSize: 20, lineHeight: 1.6, fontWeight: 300 }}>{slide.body}</div>
          <div style={{ marginTop: 26, display:'inline-flex', gap: 14 }}>
            <span style={{ padding:'14px 24px', borderRadius: 999, background: hexWithAlpha(pal.bg, 0.6), backdropFilter:'blur(10px)', border:`1px solid ${pal.ink}`, fontSize: 16, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase' }}>♥ {slide.handleCta}</span>
            <span style={{ padding:'14px 24px', borderRadius: 999, background: pal.accent, color: pal.bg, fontSize: 16, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase' }}>⌇ {slide.saveCta}</span>
          </div>
        </div>
      </>
    );
  }
  return wrap(<div />);
}
window.VaporTemplate = VaporTemplate;
