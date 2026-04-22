// RISO — Risograph print. Overprinting dots, offset color, two-ink feel.

function RisoTemplate({ slide, idx, total, handle, year, pal, fonts, mark }) {
  const dots = `radial-gradient(${hexWithAlpha(pal.accent, 0.14)} 1.5px, transparent 1.8px)`;
  const chrome = (
    <>
      <div style={{ position:'absolute', top: 40, left: 56, right: 56, display:'flex', justifyContent:'space-between', fontFamily: fonts.mono, fontSize: 13, color: pal.ink, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        <span style={{ position:'relative' }}>
          <span style={{ position:'absolute', left: 2, top: 2, color: pal.accent, mixBlendMode: 'multiply' }}>{handle}</span>
          <span>{handle}</span>
        </span>
        <span>№ {String(idx+1).padStart(2,'0')} / {String(total).padStart(2,'0')}</span>
        <span>{year}</span>
      </div>
      <div style={{ position:'absolute', bottom: 40, left: 56, right: 56, display:'flex', justifyContent:'space-between', fontFamily: fonts.mono, fontSize: 12, color: pal.muted, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
        <span>printed in {pal.ink === '#2b2a6e' ? 'blue + red' : 'teal + orange'}</span>
        <span>≈ edition of ∞</span>
      </div>
    </>
  );
  const wrap = (children, withDots = true) => (
    <div style={{
      width: SLIDE_W, height: SLIDE_H, background: pal.bg, color: pal.ink, fontFamily: fonts.body,
      position:'relative', overflow:'hidden',
      backgroundImage: withDots ? `${dots}` : 'none',
      backgroundSize: '10px 10px',
    }}>{chrome}{children}</div>
  );

  const misprint = (text, size, color1, color2) => (
    <span style={{ position:'relative', display:'inline-block' }}>
      <span style={{ position:'absolute', left: 0, top: 0, color: color2, transform: 'translate(6px, 4px)', mixBlendMode: 'multiply' }}>{text}</span>
      <span style={{ position:'relative', color: color1 }}>{text}</span>
    </span>
  );

  if (slide.kind === 'cover') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 56, top: 130, right: 56, display:'flex', justifyContent:'space-between' }}>
          <div style={{ fontFamily: fonts.mono, fontSize: 14, letterSpacing: '0.22em', textTransform: 'uppercase' }}>
            {slide.kicker}
          </div>
          <BrandMark color={pal.accent} size={56} variant={mark} />
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, top: 300, fontFamily: fonts.display, fontWeight: 800, fontSize: 180, lineHeight: 0.88, letterSpacing: '-0.04em', textTransform: 'uppercase' }}>
          {misprint('POUR', 180, pal.ink, pal.accent)}<br/>
          {misprint('OVER', 180, pal.accent, pal.ink)}<br/>
          {misprint('RITUAL.', 180, pal.ink, pal.accent)}
        </div>
        <div style={{ position:'absolute', left: 56, right: 320, bottom: 160, fontSize: 24, lineHeight: 1.4, fontFamily: fonts.body, fontWeight: 600 }}>
          {slide.subtitle}
        </div>
        <div style={{ position:'absolute', right: 56, bottom: 160, width: 140, height: 140, borderRadius: '50%', background: pal.accent, color: pal.bg, display:'flex', alignItems:'center', justifyContent:'center', fontFamily: fonts.display, fontSize: 22, fontWeight: 700, textAlign:'center', transform:'rotate(-8deg)', lineHeight: 1.1 }}>
          A FIELD<br/>GUIDE<br/>·04·
        </div>
      </>
    );
  }

  if (slide.kind === 'intro') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 56, top: 130, padding:'8px 16px', background: pal.accent, color: pal.bg, fontFamily: fonts.mono, fontSize: 14, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
          ⬢ {slide.eyebrow}
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, top: 240, fontFamily: fonts.display, fontWeight: 800, fontSize: 120, lineHeight: 0.95, letterSpacing: '-0.03em', textTransform: 'uppercase', textWrap:'balance' }}>
          {misprint(slide.title, 120, pal.ink, pal.accent)}
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, bottom: 200, background: pal.ink, color: pal.bg, padding: 32, fontSize: 24, lineHeight: 1.45, maxWidth: 880 }}>
          {slide.body}
          <div style={{ marginTop: 18, fontFamily: fonts.mono, fontSize: 14, color: pal.accent, letterSpacing: '0.12em', textTransform: 'uppercase' }}>◉ {slide.meta}</div>
        </div>
      </>
    );
  }

  if (slide.kind === 'numbered') {
    return wrap(
      <>
        <div style={{ position:'absolute', right: 56, top: 180, fontFamily: fonts.display, fontWeight: 800, fontSize: 500, lineHeight: 0.82, color: pal.accent, letterSpacing: '-0.06em', mixBlendMode:'multiply' }}>
          {slide.number}
        </div>
        <div style={{ position:'absolute', left: 56, top: 160, fontFamily: fonts.mono, fontSize: 14, letterSpacing: '0.2em', textTransform: 'uppercase', padding: '6px 14px', background: pal.ink, color: pal.bg }}>
          {slide.label}
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, top: 700, fontFamily: fonts.display, fontWeight: 800, fontSize: 88, lineHeight: 0.98, letterSpacing: '-0.03em', textTransform: 'uppercase', textWrap:'balance' }}>
          {slide.title}
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, bottom: 180, fontSize: 24, lineHeight: 1.5, fontWeight: 500, maxWidth: 880 }}>
          {slide.body}
        </div>
      </>
    );
  }

  if (slide.kind === 'stat') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 0, right: 0, top: 280, textAlign:'center' }}>
          <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 600, lineHeight: 0.84, letterSpacing: '-0.06em' }}>
            {misprint(slide.big, 600, pal.ink, pal.accent)}
          </div>
        </div>
        <div style={{ position:'absolute', left: 0, right: 0, top: 900, textAlign:'center', padding:'10px 0', background: pal.accent, color: pal.bg, fontFamily: fonts.mono, fontSize: 22, letterSpacing: '0.24em', textTransform: 'uppercase' }}>
          ◉ {slide.unit} ◉
        </div>
        <div style={{ position:'absolute', left: 120, right: 120, bottom: 200, textAlign:'center', fontSize: 22, lineHeight: 1.5, fontWeight: 500 }}>
          {slide.caption}
          <div style={{ marginTop: 12, fontFamily: fonts.mono, fontSize: 13, color: pal.muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{slide.footnote}</div>
        </div>
      </>
    );
  }

  if (slide.kind === 'list') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 56, right: 56, top: 150, fontFamily: fonts.display, fontWeight: 800, fontSize: 80, lineHeight: 1.0, textTransform: 'uppercase', textWrap:'balance' }}>
          {misprint(slide.title, 80, pal.ink, pal.accent)}
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, top: 440, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap: 16 }}>
          {slide.items.map((it, i) => (
            <div key={i} style={{
              padding: 24,
              background: i % 2 === 0 ? pal.ink : pal.accent,
              color: pal.bg, minHeight: 200, position:'relative',
              mixBlendMode: i % 2 === 1 ? 'multiply' : 'normal',
            }}>
              <div style={{ fontFamily: fonts.mono, fontSize: 13, letterSpacing: '0.14em', textTransform: 'uppercase', opacity: 0.85 }}>#{it.n}</div>
              <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 34, marginTop: 14, letterSpacing: '-0.02em', textTransform: 'uppercase' }}>{it.v}</div>
              <div style={{ fontFamily: fonts.mono, fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 10, opacity: 0.75 }}>{it.label}</div>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (slide.kind === 'image') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 56, top: 140, right: 56, position:'relative' }}>
          <div style={{ position:'absolute', inset: 0, transform:'translate(10px, 8px)', background: pal.accent, mixBlendMode:'multiply', zIndex: 0 }} />
          <div style={{ position:'relative', zIndex: 1 }}>
            <ImgSlot label={slide.imageLabel} color={pal.ink} bg={pal.bg} mono={fonts.mono} aspect="4/3" />
          </div>
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, bottom: 180, fontFamily: fonts.display, fontWeight: 800, fontSize: 80, textTransform:'uppercase', lineHeight: 0.95, letterSpacing: '-0.03em' }}>
          {misprint(slide.title, 80, pal.ink, pal.accent)}
          <div style={{ marginTop: 20, fontFamily: fonts.body, fontWeight: 500, fontSize: 22, lineHeight: 1.5, textTransform: 'none', letterSpacing: 0, color: pal.ink, maxWidth: 840 }}>
            {slide.caption}
          </div>
        </div>
      </>
    );
  }

  if (slide.kind === 'cta') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 0, right: 0, top: 300, textAlign:'center', fontFamily: fonts.display, fontWeight: 800, fontSize: 200, lineHeight: 0.88, textTransform: 'uppercase', letterSpacing: '-0.04em' }}>
          {misprint('Like.', 200, pal.ink, pal.accent)}<br/>
          {misprint('Save.', 200, pal.accent, pal.ink)}
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, bottom: 200, fontSize: 22, lineHeight: 1.5, fontWeight: 500, textAlign:'center', maxWidth: 800, margin: '0 auto' }}>
          {slide.body}
          <div style={{ marginTop: 26, display:'inline-flex', gap: 10, fontFamily: fonts.mono, fontSize: 14, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
            <span style={{ padding: '14px 22px', background: pal.ink, color: pal.bg }}>♥ {slide.handleCta}</span>
            <span style={{ padding: '14px 22px', background: pal.accent, color: pal.bg }}>⌇ {slide.saveCta}</span>
          </div>
        </div>
      </>
    );
  }
  return wrap(<div />);
}
window.RisoTemplate = RisoTemplate;
