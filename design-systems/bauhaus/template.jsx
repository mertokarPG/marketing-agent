// BAUHAUS — Primary shapes, circle/square/triangle, bold color blocks.

function BauhausTemplate({ slide, idx, total, handle, year, pal, fonts, mark }) {
  const chrome = (
    <>
      <div style={{ position:'absolute', top: 44, left: 56, right: 56, display:'flex', justifyContent:'space-between', alignItems:'center', fontFamily: fonts.mono, fontSize: 13, color: pal.ink, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
        <span>{handle}</span>
        <span style={{ display:'inline-flex', gap: 6, alignItems:'center' }}>
          <span style={{ width: 14, height: 14, borderRadius:'50%', background: pal.accent }}/>
          <span style={{ width: 14, height: 14, background: pal.ink }}/>
          <span style={{ width: 0, height: 0, borderLeft:'7px solid transparent', borderRight:'7px solid transparent', borderBottom:`12px solid ${pal.ink}`}}/>
        </span>
        <span>№{String(idx+1).padStart(2,'0')}</span>
      </div>
      <div style={{ position:'absolute', bottom: 44, left: 56, right: 56, borderTop: `3px solid ${pal.ink}`, paddingTop: 14, display:'flex', justifyContent:'space-between', fontFamily: fonts.mono, fontSize: 12, color: pal.ink, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
        <span>form · function</span>
        <span>{year}</span>
      </div>
    </>
  );
  const wrap = (children) => (
    <div style={{ width: SLIDE_W, height: SLIDE_H, background: pal.bg, color: pal.ink, fontFamily: fonts.body, position:'relative', overflow:'hidden' }}>{chrome}{children}</div>
  );

  if (slide.kind === 'cover') {
    return wrap(
      <>
        <div style={{ position:'absolute', right: 56, top: 130, width: 260, height: 260, borderRadius:'50%', background: pal.accent }}/>
        <div style={{ position:'absolute', right: 220, top: 240, width: 180, height: 180, background: pal.ink }}/>
        <div style={{ position:'absolute', right: 400, top: 130, width: 0, height: 0, borderLeft:'90px solid transparent', borderRight:'90px solid transparent', borderBottom: `160px solid ${pal.accent}`, opacity: 0.92 }}/>
        <div style={{ position:'absolute', left: 56, right: 56, top: 560, fontFamily: fonts.display, fontWeight: 900, fontSize: 156, lineHeight: 0.9, letterSpacing: '-0.04em', textTransform: 'uppercase', textWrap:'balance' }}>
          {String(slide.title || '').split(/\s+/).filter(Boolean).map((w, i, arr) => (
            <span key={i} style={{ color: i === arr.length - 1 ? pal.accent : pal.ink }}>{w}{' '}</span>
          ))}
        </div>
        <div style={{ position:'absolute', left: 56, right: 400, bottom: 150, fontSize: 22, lineHeight: 1.4, fontWeight: 500 }}>
          {slide.subtitle}
        </div>
      </>
    );
  }

  if (slide.kind === 'intro') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 56, top: 160, padding:'8px 16px', background: pal.accent, color: pal.bg, fontFamily: fonts.mono, fontSize: 14, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>
          ● {slide.eyebrow}
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, top: 260 }}>
          <h2 style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 140, lineHeight: 0.92, letterSpacing: '-0.035em', textTransform: 'uppercase', margin: 0, textWrap:'balance' }}>
            {slide.title}
          </h2>
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, bottom: 200, display:'grid', gridTemplateColumns:'60px 1fr', gap: 30, alignItems:'start' }}>
          <div style={{ width: 60, height: 60, borderRadius:'50%', background: pal.accent }}/>
          <div style={{ fontSize: 26, lineHeight: 1.5, fontWeight: 500 }}>
            {slide.body}
            <div style={{ marginTop: 18, fontFamily: fonts.mono, fontSize: 14, letterSpacing: '0.14em', textTransform: 'uppercase', color: pal.ink }}>■ {slide.meta}</div>
          </div>
        </div>
      </>
    );
  }

  if (slide.kind === 'numbered') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 0, top: 130, width: '50%', height: 600, background: pal.accent }}/>
        <div style={{ position:'absolute', left: 56, right: 56, top: 200, display:'grid', gridTemplateColumns:'1fr 1fr', gap: 40, alignItems:'center', height: 460 }}>
          <div style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 420, lineHeight: 0.86, color: pal.bg, letterSpacing: '-0.06em', paddingLeft: 40 }}>
            {slide.number}
          </div>
          <div>
            <div style={{ fontFamily: fonts.mono, fontSize: 14, letterSpacing: '0.2em', textTransform: 'uppercase', color: pal.ink }}>■ {slide.label}</div>
            <h2 style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 64, lineHeight: 1.0, letterSpacing: '-0.03em', textTransform: 'uppercase', margin: '20px 0 0', textWrap:'balance' }}>
              {slide.title}
            </h2>
          </div>
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, top: 800, borderTop: `3px solid ${pal.ink}`, paddingTop: 24, fontSize: 24, lineHeight: 1.5, fontWeight: 500, maxWidth: 900 }}>
          {slide.body}
        </div>
      </>
    );
  }

  if (slide.kind === 'stat') {
    return wrap(
      <>
        <div style={{ position:'absolute', right: -100, top: 200, width: 500, height: 500, borderRadius:'50%', background: pal.accent }}/>
        <div style={{ position:'absolute', left: 56, top: 240, fontFamily: fonts.mono, fontSize: 14, letterSpacing: '0.2em', textTransform: 'uppercase' }}>● Metric</div>
        <div style={{ position:'absolute', left: 56, right: 56, top: 370, fontFamily: fonts.display, fontWeight: 900, fontSize: 360, lineHeight: 0.88, letterSpacing: '-0.05em', textAlign: 'left' }}>
          {slide.big}
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, top: 860, fontFamily: fonts.mono, fontSize: 22, letterSpacing: '0.2em', textTransform: 'uppercase', color: pal.ink }}>
          ■ {slide.unit}
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, bottom: 190, borderTop: `3px solid ${pal.ink}`, paddingTop: 20, fontSize: 22, lineHeight: 1.5, maxWidth: 820, fontWeight: 500 }}>
          {slide.caption}
          <div style={{ marginTop: 10, fontFamily: fonts.mono, fontSize: 12, color: pal.muted, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{slide.footnote}</div>
        </div>
      </>
    );
  }

  if (slide.kind === 'list') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 56, right: 56, top: 150, fontFamily: fonts.display, fontWeight: 900, fontSize: 88, lineHeight: 0.98, textTransform: 'uppercase', letterSpacing: '-0.03em', textWrap:'balance' }}>
          {slide.title}
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, top: 400, display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gridTemplateRows:'repeat(2, 1fr)', gap: 0, border: `3px solid ${pal.ink}` }}>
          {slide.items.map((it, i) => {
            const palettes = [
              { bg: pal.accent, fg: pal.bg },
              { bg: pal.bg, fg: pal.ink },
              { bg: pal.ink, fg: pal.bg },
              { bg: pal.bg, fg: pal.ink },
              { bg: pal.ink, fg: pal.bg },
              { bg: pal.accent, fg: pal.bg },
            ];
            const p = palettes[i];
            return (
              <div key={i} style={{
                padding: 22, minHeight: 170, background: p.bg, color: p.fg,
                borderRight: i % 3 !== 2 ? `3px solid ${pal.ink}` : 'none',
                borderBottom: i < 3 ? `3px solid ${pal.ink}` : 'none',
              }}>
                <div style={{ fontFamily: fonts.mono, fontSize: 13, letterSpacing: '0.16em' }}>{it.n}</div>
                <div style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 32, marginTop: 8, textTransform: 'uppercase', letterSpacing: '-0.02em' }}>{it.v}</div>
                <div style={{ fontFamily: fonts.mono, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: 6, opacity: 0.8 }}>{it.label}</div>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  if (slide.kind === 'image') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 56, top: 140, width: 600, height: 720, background: pal.accent, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ width: '85%' }}>
            <ImgSlot label={slide.imageLabel} color={pal.bg} bg={pal.accent} mono={fonts.mono} aspect="3/4" />
          </div>
        </div>
        <div style={{ position:'absolute', right: 56, top: 200, width: 320 }}>
          <div style={{ width: 120, height: 120, borderRadius:'50%', background: pal.ink, marginBottom: 30 }}/>
          <h2 style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 60, lineHeight: 0.98, letterSpacing: '-0.03em', textTransform: 'uppercase', margin: 0 }}>{slide.title}</h2>
        </div>
        <div style={{ position:'absolute', right: 56, bottom: 200, width: 320, fontSize: 20, lineHeight: 1.5, fontWeight: 500 }}>
          {slide.caption}
        </div>
      </>
    );
  }

  if (slide.kind === 'cta') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 0, top: 200, width: 500, height: 500, background: pal.accent, clipPath:'polygon(0 0, 100% 0, 0 100%)' }}/>
        <div style={{ position:'absolute', right: 56, top: 200, width: 200, height: 200, borderRadius:'50%', background: pal.ink }}/>
        <div style={{ position:'absolute', left: 56, right: 56, bottom: 320, fontFamily: fonts.display, fontWeight: 900, fontSize: 128, lineHeight: 0.95, letterSpacing: '-0.035em', textTransform: 'uppercase', textWrap:'balance' }}>
          {String(slide.title || '').split(/\s+/).filter(Boolean).map((w, i, arr) => (
            <span key={i} style={{ color: i === arr.length - 1 ? pal.accent : pal.ink }}>{w}{' '}</span>
          ))}
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, bottom: 140 }}>
          <div style={{ fontSize: 22, lineHeight: 1.4, fontWeight: 500, maxWidth: 720 }}>{slide.body}</div>
          <div style={{ marginTop: 20, display:'flex', gap: 10, fontFamily: fonts.mono, fontSize: 14, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            <span style={{ padding: '14px 20px', background: pal.ink, color: pal.bg }}>♥ {slide.handleCta}</span>
            <span style={{ padding: '14px 20px', background: pal.accent, color: pal.bg }}>⌇ {slide.saveCta}</span>
          </div>
        </div>
      </>
    );
  }
  return wrap(<div />);
}
window.BauhausTemplate = BauhausTemplate;
