// TERMINAL — CRT / green-on-black monospace aesthetic with scanlines.

function TerminalTemplate({ slide, idx, total, handle, year, pal, fonts, mark }) {
  const scanlines = `repeating-linear-gradient(0deg, transparent 0 2px, ${hexWithAlpha(pal.ink, 0.04)} 2px 3px)`;
  const chrome = (
    <>
      <div style={{ position:'absolute', top: 40, left: 56, right: 56, display:'flex', justifyContent:'space-between', fontFamily: fonts.mono, fontSize: 14, letterSpacing: '0.04em', color: pal.ink }}>
        <span>[user@{handle.replace('@','')}:~]$</span>
        <span style={{ color: pal.accent }}>● CONNECTED</span>
        <span>{year} · p.{String(idx+1).padStart(2,'0')}/{String(total).padStart(2,'0')}</span>
      </div>
      <div style={{ position:'absolute', top: 72, left: 56, right: 56, borderBottom: `1px dashed ${pal.rule}` }}/>
      <div style={{ position:'absolute', bottom: 72, left: 56, right: 56, borderTop: `1px dashed ${pal.rule}` }}/>
      <div style={{ position:'absolute', bottom: 40, left: 56, right: 56, fontFamily: fonts.mono, fontSize: 13, letterSpacing: '0.04em', color: pal.muted, display:'flex', justifyContent:'space-between' }}>
        <span>&gt;&gt; swipe_right --continue</span>
        <span style={{ color: pal.accent }}>▊</span>
      </div>
    </>
  );
  const wrap = (children) => (
    <div style={{ width: SLIDE_W, height: SLIDE_H, background: pal.bg, color: pal.ink, fontFamily: fonts.mono, position:'relative', overflow:'hidden', backgroundImage: scanlines }}>{chrome}{children}</div>
  );

  if (slide.kind === 'cover') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 56, right: 56, top: 130, fontFamily: fonts.mono, fontSize: 15, color: pal.muted }}>
          &gt; init --module={String(slide.kicker || 'module').toLowerCase().replace(/\W+/g, '_')} --verbose<br/>
          &gt; loading assets... [████████] 100%<br/>
          &gt; ready.
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, top: 300, fontFamily: fonts.display, fontSize: 160, lineHeight: 0.95, letterSpacing: '0.01em', color: pal.accent, textTransform: 'uppercase', textWrap: 'balance' }}>
          {slide.title}
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, top: 900, fontFamily: fonts.mono, fontSize: 18, color: pal.ink, lineHeight: 1.5 }}>
          <span style={{ color: pal.accent }}>$</span> echo
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, top: 950, fontSize: 22, lineHeight: 1.5, fontFamily: fonts.mono, color: pal.ink, maxWidth: 900 }}>
          {slide.subtitle}
        </div>
      </>
    );
  }

  if (slide.kind === 'intro') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 56, top: 130, fontSize: 15, color: pal.accent }}>
          &gt; cat ./chapter_01.md
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, top: 220 }}>
          <div style={{ fontSize: 15, color: pal.muted, marginBottom: 20 }}># {slide.eyebrow}</div>
          <h2 style={{ fontFamily: fonts.display, fontSize: 130, lineHeight: 0.92, letterSpacing: '0.01em', margin: 0, textTransform: 'uppercase', color: pal.accent, textWrap:'balance' }}>
            {slide.title}
          </h2>
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, bottom: 180, fontSize: 22, lineHeight: 1.6, maxWidth: 900, fontFamily: fonts.mono, borderLeft: `3px solid ${pal.accent}`, paddingLeft: 24 }}>
          {slide.body}
          <div style={{ marginTop: 18, fontSize: 14, color: pal.muted }}>{'// ~ ' + slide.meta}</div>
        </div>
      </>
    );
  }

  if (slide.kind === 'numbered') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 56, top: 130, fontSize: 15, color: pal.accent }}>
          &gt; ./principle --id={slide.number}
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, top: 220, fontFamily: fonts.display, fontSize: 540, lineHeight: 0.88, color: pal.accent, textAlign:'left' }}>
          {'>'}{slide.number}
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, top: 820, fontSize: 15, color: pal.muted }}>
          /* {slide.label} */
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, top: 870, fontFamily: fonts.display, fontSize: 64, lineHeight: 1.0, textTransform: 'uppercase', textWrap:'balance' }}>
          {slide.title}
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, bottom: 170, fontSize: 20, lineHeight: 1.55, maxWidth: 900 }}>
          {slide.body}
        </div>
      </>
    );
  }

  if (slide.kind === 'stat') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 56, top: 130, fontSize: 15, color: pal.accent }}>
          &gt; SELECT AVG(pour_time) FROM tastings;
        </div>
        <div style={{ position:'absolute', left: 40, right: 40, top: 380, textAlign:'center', fontFamily: fonts.display, fontSize: 380, lineHeight: 0.92, color: pal.accent, textTransform: 'uppercase' }}>
          {slide.big}
        </div>
        <div style={{ position:'absolute', left: 0, right: 0, top: 880, textAlign:'center', fontSize: 22, letterSpacing: '0.18em', textTransform: 'uppercase', color: pal.ink }}>
          &gt; unit := {slide.unit}
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, bottom: 160, fontSize: 20, lineHeight: 1.55, fontFamily: fonts.mono, maxWidth: 900, borderLeft: `3px solid ${pal.accent}`, paddingLeft: 22 }}>
          {slide.caption}
          <div style={{ marginTop: 10, fontSize: 13, color: pal.muted }}>{'// ' + slide.footnote}</div>
        </div>
      </>
    );
  }

  if (slide.kind === 'list') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 56, top: 130, fontSize: 15, color: pal.accent }}>
          &gt; ls -la ./toolkit/
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, top: 220, fontFamily: fonts.display, fontSize: 72, lineHeight: 1.0, color: pal.accent, textTransform: 'uppercase' }}>
          {slide.title}
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, top: 440, fontSize: 20 }}>
          <div style={{ display:'grid', gridTemplateColumns:'60px 100px 1fr 120px', padding:'10px 0', borderBottom: `1px dashed ${pal.rule}`, color: pal.muted, fontSize: 14, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            <span>#</span><span>type</span><span>target</span><span style={{ textAlign:'right' }}>flag</span>
          </div>
          {slide.items.map((it, i) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'60px 100px 1fr 120px', padding:'20px 0', borderBottom: `1px dashed ${pal.rule}`, alignItems: 'baseline' }}>
              <span style={{ color: pal.accent }}>{it.n}</span>
              <span style={{ fontSize: 14, color: pal.muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{it.label}</span>
              <span style={{ fontFamily: fonts.display, fontSize: 30, textTransform: 'uppercase' }}>{it.v}</span>
              <span style={{ textAlign:'right', color: pal.accent, fontSize: 14 }}>[--ok]</span>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (slide.kind === 'image') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 56, top: 130, fontSize: 15, color: pal.accent }}>
          &gt; render ./bloom_stage.ascii
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, top: 210, border: `2px solid ${pal.accent}`, padding: 10 }}>
          <ImgSlot label={slide.imageLabel} color={pal.ink} bg={pal.bg} mono={fonts.mono} aspect="4/3" />
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, bottom: 170 }}>
          <div style={{ fontFamily: fonts.display, fontSize: 64, lineHeight: 1.0, textTransform: 'uppercase', color: pal.accent }}>
            &gt; {slide.title}
          </div>
          <div style={{ marginTop: 16, fontSize: 20, lineHeight: 1.5, maxWidth: 900 }}>{slide.caption}</div>
        </div>
      </>
    );
  }

  if (slide.kind === 'cta') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 56, top: 130, fontSize: 15, color: pal.accent }}>
          &gt; exit(0);
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, top: 320, fontFamily: fonts.display, fontSize: 148, lineHeight: 0.98, textTransform: 'uppercase', color: pal.accent, letterSpacing: '0.01em', textWrap: 'balance' }}>
          {String(slide.title || '').split(/\s+/).filter(Boolean).map((w, i, arr) => (
            <span key={i} style={{ color: i === 0 ? pal.accent : pal.ink }}>{w}{' '}</span>
          ))}
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, bottom: 170, fontSize: 20, lineHeight: 1.5, maxWidth: 900, borderLeft: `3px solid ${pal.accent}`, paddingLeft: 22 }}>
          {slide.body}
          <div style={{ marginTop: 18, display:'flex', gap: 10, fontSize: 14, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            <span style={{ padding:'12px 18px', border: `1px solid ${pal.ink}` }}>[♥ {slide.handleCta}]</span>
            <span style={{ padding:'12px 18px', background: pal.accent, color: pal.bg }}>[⌇ {slide.saveCta}]</span>
          </div>
        </div>
      </>
    );
  }
  return wrap(<div />);
}
window.TerminalTemplate = TerminalTemplate;
