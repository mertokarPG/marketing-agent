// ARCHIVE — Newspaper masthead. Condensed serif headlines, thick rules, columned body.

function ArchiveTemplate({ slide, idx, total, handle, year, pal, fonts, mark }) {
  const masthead = (
    <>
      <div style={{ position:'absolute', top: 56, left: 56, right: 56, borderTop: `4px double ${pal.rule}`, borderBottom: `1px solid ${pal.rule}`, padding: '14px 0', display:'flex', justifyContent:'space-between', alignItems:'center', fontFamily: fonts.mono, fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', color: pal.ink }}>
        <span>Vol. IV · No. {String(idx+1).padStart(2,'0')}</span>
        <span style={{ fontFamily: fonts.display, fontStyle: 'italic', fontSize: 18, textTransform: 'none', letterSpacing: '0.02em' }}>The {handle.replace('@','')} Chronicle</span>
        <span>{year} · One Dollar</span>
      </div>
      <div style={{ position:'absolute', bottom: 56, left: 56, right: 56, borderTop: `1px solid ${pal.rule}`, borderBottom: `4px double ${pal.rule}`, padding: '14px 0', display:'flex', justifyContent:'space-between', fontFamily: fonts.mono, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: pal.muted }}>
        <span>{handle}</span>
        <span>continued overleaf →</span>
        <span>pg. {String(idx+1).padStart(2,'0')}</span>
      </div>
    </>
  );
  const wrap = (children) => (
    <div style={{ width: SLIDE_W, height: SLIDE_H, background: pal.bg, color: pal.ink, fontFamily: fonts.body, position:'relative', overflow:'hidden' }}>{masthead}{children}</div>
  );

  if (slide.kind === 'cover') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 56, right: 56, top: 180, textAlign:'center' }}>
          <div style={{ fontFamily: fonts.mono, fontSize: 14, letterSpacing: '0.22em', textTransform: 'uppercase', color: pal.accent, marginBottom: 30 }}>
            ※ {slide.kicker} ※
          </div>
          <h1 style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 170, lineHeight: 0.92, letterSpacing: '-0.025em', margin: 0, textWrap: 'balance', fontStyle: 'italic' }}>
            The Quiet Ritual
          </h1>
          <div style={{ fontFamily: fonts.display, fontWeight: 400, fontSize: 72, fontStyle: 'italic', marginTop: 12, color: pal.accent }}>
            of pour-over coffee.
          </div>
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, top: 780, borderTop: `1px solid ${pal.rule}`, paddingTop: 30, display:'grid', gridTemplateColumns:'1fr 1fr', gap: 40 }}>
          <div style={{ fontSize: 22, lineHeight: 1.55, fontFamily: fonts.body, columnCount: 1 }}>
            <span style={{ fontFamily: fonts.display, fontSize: 80, lineHeight: 0.9, float:'left', marginRight: 14, marginTop: 6, color: pal.accent }}>F</span>
            {slide.subtitle}
          </div>
          <div style={{ borderLeft: `1px solid ${pal.rule}`, paddingLeft: 32 }}>
            <div style={{ fontFamily: fonts.mono, fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: pal.muted }}>In this issue</div>
            <ul style={{ marginTop: 16, padding: 0, listStyle:'none', fontFamily: fonts.display, fontSize: 24, lineHeight: 1.5, fontStyle: 'italic' }}>
              <li>— Water that sweetens</li>
              <li>— A four-minute pour</li>
              <li>— Our daily kit</li>
              <li>— Saving for Sunday</li>
            </ul>
          </div>
        </div>
      </>
    );
  }

  if (slide.kind === 'intro') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 56, right: 56, top: 200, textAlign:'center' }}>
          <div style={{ fontFamily: fonts.mono, fontSize: 13, letterSpacing: '0.22em', textTransform: 'uppercase', color: pal.accent }}>
            — {slide.eyebrow} —
          </div>
          <h2 style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 96, lineHeight: 1.02, letterSpacing: '-0.02em', margin: '30px 0 0', fontStyle: 'italic', textWrap: 'balance' }}>{slide.title}</h2>
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, bottom: 200, columnCount: 2, columnGap: 40, fontSize: 20, lineHeight: 1.6, fontFamily: fonts.body }}>
          <span style={{ fontFamily: fonts.mono, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: pal.muted }}>{slide.meta} · </span>
          {slide.body} {slide.body}
        </div>
      </>
    );
  }

  if (slide.kind === 'numbered') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 0, right: 0, top: 180, textAlign:'center', fontFamily: fonts.display, fontStyle: 'italic', fontSize: 40, color: pal.accent }}>
          Chapter {slide.number}.
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, top: 280, textAlign:'center' }}>
          <h2 style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 104, lineHeight: 1.0, letterSpacing: '-0.02em', margin: 0, textWrap: 'balance' }}>{slide.title}</h2>
          <div style={{ fontFamily: fonts.mono, fontSize: 12, letterSpacing: '0.22em', textTransform: 'uppercase', color: pal.muted, marginTop: 24 }}>
            — {slide.label} —
          </div>
        </div>
        <div style={{ position:'absolute', left: 120, right: 120, bottom: 220, fontSize: 22, lineHeight: 1.65, fontFamily: fonts.body, columnCount: 2, columnGap: 40 }}>
          <span style={{ fontFamily: fonts.display, fontSize: 64, lineHeight: 0.9, float:'left', marginRight: 12, marginTop: 6, color: pal.ink, fontWeight: 900 }}>{slide.body.charAt(0)}</span>
          {slide.body.substring(1)}
        </div>
      </>
    );
  }

  if (slide.kind === 'stat') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 0, right: 0, top: 200, textAlign:'center', fontFamily: fonts.display, fontStyle:'italic', fontSize: 40, color: pal.accent }}>
          Of record —
        </div>
        <div style={{ position:'absolute', left: 0, right: 0, top: 300, textAlign:'center', fontFamily: fonts.display, fontWeight: 900, fontSize: 500, lineHeight: 0.88, letterSpacing: '-0.04em', fontStyle:'italic' }}>
          {slide.big}
        </div>
        <div style={{ position:'absolute', left: 0, right: 0, top: 840, textAlign:'center', fontFamily: fonts.mono, fontSize: 20, letterSpacing: '0.24em', textTransform: 'uppercase', color: pal.muted }}>
          {slide.unit}
        </div>
        <div style={{ position:'absolute', left: 180, right: 180, bottom: 220, textAlign:'center', borderTop: `1px solid ${pal.rule}`, paddingTop: 28, fontFamily: fonts.body, fontSize: 22, lineHeight: 1.6 }}>
          {slide.caption}
          <div style={{ marginTop: 14, fontFamily: fonts.display, fontStyle:'italic', fontSize: 18, color: pal.muted }}>{slide.footnote}</div>
        </div>
      </>
    );
  }

  if (slide.kind === 'list') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 56, right: 56, top: 200, textAlign:'center' }}>
          <div style={{ fontFamily: fonts.mono, fontSize: 13, letterSpacing: '0.22em', textTransform: 'uppercase', color: pal.accent }}>— Dispatches —</div>
          <h2 style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 72, fontStyle:'italic', lineHeight: 1.05, margin: '20px 0 0' }}>{slide.title}</h2>
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, top: 420 }}>
          {slide.items.map((it, i) => (
            <div key={i} style={{
              display:'grid', gridTemplateColumns: '1fr 1fr', alignItems:'baseline',
              padding: '18px 0', borderBottom: i === slide.items.length-1 ? 'none' : `1px dotted ${pal.rule}`,
            }}>
              <div style={{ display:'flex', gap: 16, alignItems:'baseline' }}>
                <span style={{ fontFamily: fonts.display, fontStyle:'italic', fontSize: 30, color: pal.accent }}>{it.n}.</span>
                <span style={{ fontFamily: fonts.mono, fontSize: 13, letterSpacing: '0.14em', textTransform: 'uppercase', color: pal.muted }}>{it.label}</span>
              </div>
              <div style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 34, letterSpacing: '-0.02em', fontStyle:'italic', textAlign:'right' }}>{it.v}</div>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (slide.kind === 'image') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 56, right: 56, top: 180 }}>
          <ImgSlot label={slide.imageLabel} color={pal.ink} bg={pal.bg} mono={fonts.mono} aspect="3/2" />
          <div style={{ marginTop: 14, fontFamily: fonts.mono, fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: pal.muted, textAlign:'center' }}>
            — Fig. 02 · photograph by staff —
          </div>
        </div>
        <div style={{ position:'absolute', left: 56, right: 56, top: 820, textAlign:'center' }}>
          <h2 style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 72, lineHeight: 1.0, fontStyle:'italic', margin: 0, color: pal.accent }}>{slide.title}</h2>
        </div>
        <div style={{ position:'absolute', left: 100, right: 100, bottom: 200, columnCount: 2, columnGap: 32, fontSize: 20, lineHeight: 1.65 }}>
          {slide.caption}
        </div>
      </>
    );
  }

  if (slide.kind === 'cta') {
    return wrap(
      <>
        <div style={{ position:'absolute', left: 56, right: 56, top: 400, textAlign:'center' }}>
          <div style={{ fontFamily: fonts.mono, fontSize: 13, letterSpacing: '0.22em', textTransform: 'uppercase', color: pal.accent }}>
            — In Closing —
          </div>
          <h2 style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 120, lineHeight: 0.98, margin: '30px 0 0', fontStyle:'italic', textWrap: 'balance' }}>
            Saved, <span style={{ color: pal.accent }}>and shared.</span>
          </h2>
        </div>
        <div style={{ position:'absolute', left: 120, right: 120, bottom: 220, textAlign:'center', borderTop: `1px solid ${pal.rule}`, paddingTop: 28 }}>
          <div style={{ fontSize: 22, lineHeight: 1.6, fontFamily: fonts.body }}>{slide.body}</div>
          <div style={{ marginTop: 28, fontFamily: fonts.display, fontStyle:'italic', fontSize: 26 }}>
            ♥ {slide.handleCta} &nbsp; · &nbsp; <span style={{ color: pal.accent }}>⌇ {slide.saveCta}</span>
          </div>
        </div>
      </>
    );
  }
  return wrap(<div />);
}
window.ArchiveTemplate = ArchiveTemplate;
