// Main App — carousel + grid overview, tweaks panel, template switcher.

const TEMPLATE_RENDERERS = {
  atelier: AtelierTemplate,
  signal: SignalTemplate,
  mute: MuteTemplate,
  gridos: GridOSTemplate,
  bloom: BloomTemplate,
  archive: ArchiveTemplate,
  riso: RisoTemplate,
  vapor: VaporTemplate,
  bauhaus: BauhausTemplate,
  terminal: TerminalTemplate,
  couture: CoutureTemplate,
  nocturne: NocturneTemplate,
};

// Default tweak state, persisted in a single JSON block so the host can rewrite it.
const DEFAULT_TWEAKS = /*EDITMODE-BEGIN*/{
  "templateId": "atelier",
  "mode": "light",
  "handle": "@slowbrew.studio",
  "year": "2026",
  "markVariant": "quad",
  "customAccent": "",
  "viewMode": "carousel"
}/*EDITMODE-END*/;

function useLocalState(key, initial) {
  const [v, setV] = React.useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return { ...initial, ...JSON.parse(raw) };
    } catch (e) {}
    return initial;
  });
  React.useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {}
  }, [key, v]);
  return [v, setV];
}

function Slide({ template, slide, idx, total, handle, year, mode, markVariant, customAccent }) {
  const Renderer = TEMPLATE_RENDERERS[template.id];
  const basePal = template.palettes[mode];
  const pal = customAccent ? { ...basePal, accent: customAccent } : basePal;
  return (
    <Renderer
      slide={slide}
      idx={idx}
      total={total}
      handle={handle}
      year={year}
      pal={pal}
      fonts={template.fonts}
      mark={markVariant}
    />
  );
}

function ScaledSlide({ children, maxW, maxH }) {
  const holder = React.useRef(null);
  const [scale, setScale] = React.useState(1);
  React.useLayoutEffect(() => {
    const update = () => {
      if (!holder.current) return;
      const rect = holder.current.getBoundingClientRect();
      const sx = rect.width / SLIDE_W;
      const sy = rect.height / SLIDE_H;
      setScale(Math.min(sx, sy));
    };
    update();
    const ro = new ResizeObserver(update);
    if (holder.current) ro.observe(holder.current);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={holder} className="slide-viewport">
      <div className="slide-scaler" style={{ transform: `scale(${scale})`, width: SLIDE_W, height: SLIDE_H }}>
        {children}
      </div>
    </div>
  );
}

function GridThumb({ template, slide, idx, total, state, onClick }) {
  const ref = React.useRef(null);
  const [scale, setScale] = React.useState(0.2);
  React.useLayoutEffect(() => {
    const update = () => {
      if (!ref.current) return;
      const w = ref.current.getBoundingClientRect().width;
      setScale(w / SLIDE_W);
    };
    update();
    const ro = new ResizeObserver(update);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="grid-cell" onClick={onClick}>
      <div ref={ref} className="grid-thumb">
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: SLIDE_W, height: SLIDE_H }}>
          <Slide template={template} slide={slide} idx={idx} total={total} {...state} />
        </div>
      </div>
      <div className="label">
        <span>{String(idx+1).padStart(2,'0')} · {slide.kind}</span>
        <span>{template.id}</span>
      </div>
    </div>
  );
}

function Sidebar({ tweaks, setTweaks, template }) {
  const accents = {
    atelier:  ['#b84a2a', '#d97757', '#2e4a3a', '#1f3dff', '#c4963a'],
    signal:   ['#1f3dff', '#ff2e4d', '#00a86b', '#ff8a00', '#111111'],
    mute:     ['#2e4a3a', '#7a5a3a', '#3a3a6a', '#8a3a4a', '#4a4a4a'],
    gridos:   ['#ff5c1a', '#1f3dff', '#00c48a', '#c82a7c', '#0a0a0a'],
    bloom:    ['#7a2450', '#d94a6a', '#e88c42', '#5a7a8a', '#3a2a4a'],
    archive:  ['#8a1414', '#1f3d6a', '#4a4a2a', '#6a3a1a', '#0a0a0a'],
    riso:     ['#e74b3c', '#2b2a6e', '#e8a43c', '#1a8a5a', '#c92a7a'],
    vapor:    ['#a85fc2', '#f2a4c4', '#6a9acc', '#c8a85a', '#e89a7c'],
    bauhaus:  ['#e63b1e', '#ffcc00', '#0a4aa0', '#0a0a0a', '#1a8a3a'],
    terminal: ['#1a8a2e', '#3aff6a', '#ff3a3a', '#ffaa00', '#00c8ff'],
    couture:  ['#8a6a3a', '#d4a55a', '#6a1a1a', '#1a1a1a', '#4a4a4a'],
    nocturne: ['#c8ff3a', '#ff2e80', '#00e1ff', '#ff6a00', '#9a6aff'],
  };
  const palette = accents[tweaks.templateId] || accents.atelier;
  const set = (k, v) => setTweaks({ ...tweaks, [k]: v });
  return (
    <aside className="sidebar">
      <div className="system-chip">
        <b>{template.name}</b> <span style={{color:'#707070'}}>· {template.tag}</span><br/>
        <span style={{color:'#707070'}}>display</span> <b>{template.fonts.display.split(',')[0].replace(/'/g,'')}</b><br/>
        <span style={{color:'#707070'}}>body</span> <b>{template.fonts.body.split(',')[0].replace(/'/g,'')}</b><br/>
        <span className="accent">● {tweaks.customAccent || template.palettes[tweaks.mode].accent}</span>
      </div>

      <div className="sidebar-section">
        <h3>Mode</h3>
        <div className="tweak-row">
          <div className="seg-control">
            <button className={tweaks.mode === 'light' ? 'active' : ''} onClick={() => set('mode','light')}>Light</button>
            <button className={tweaks.mode === 'dark' ? 'active' : ''} onClick={() => set('mode','dark')}>Dark</button>
          </div>
        </div>
      </div>

      <div className="sidebar-section">
        <h3>Accent</h3>
        <div className="tweak-row">
          <div className="swatch-row">
            <button
              onClick={() => set('customAccent', '')}
              className={!tweaks.customAccent ? 'active' : ''}
              style={{ background: template.palettes[tweaks.mode].accent }}
              title="Default"
            />
            {palette.map(c => (
              <button key={c}
                onClick={() => set('customAccent', c)}
                className={tweaks.customAccent === c ? 'active' : ''}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="sidebar-section">
        <h3>Brand</h3>
        <div className="tweak-row">
          <label>Handle</label>
          <input type="text" value={tweaks.handle} onChange={e => set('handle', e.target.value)} />
        </div>
        <div className="tweak-row">
          <label>Year</label>
          <input type="text" value={tweaks.year} onChange={e => set('year', e.target.value)} />
        </div>
        <div className="tweak-row">
          <label>Mark</label>
          <div className="seg-control">
            {['quad','ring','bar'].map(v => (
              <button key={v} className={tweaks.markVariant === v ? 'active' : ''} onClick={() => set('markVariant', v)}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="sidebar-section">
        <h3>Swap template</h3>
        <div className="tweak-row" style={{ gap: 6 }}>
          {TEMPLATES.map(t => (
            <button
              key={t.id}
              onClick={() => set('templateId', t.id)}
              style={{
                padding: '10px 14px', borderRadius: 8, background: tweaks.templateId === t.id ? '#242424' : '#141414',
                color: '#eee', fontFamily: 'Space Grotesk', fontSize: 13, textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
              <span>{t.name}</span>
              <span style={{ color:'#707070', fontSize: 11, letterSpacing: '0.04em' }}>{t.tag}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="hint">
        Each template ships with 7 reusable slide layouts — cover, intro, numbered principle, stat, list, image, CTA. Body copy comes from the sample coffee-studio carousel; the agent would inject per-brand content here.
      </div>
    </aside>
  );
}

function Carousel({ template, slides, state }) {
  const [idx, setIdx] = React.useState(() => {
    try { return parseInt(localStorage.getItem('igt-idx') || '0', 10); } catch(e){ return 0; }
  });
  React.useEffect(() => { try { localStorage.setItem('igt-idx', String(idx)); } catch(e){} }, [idx]);
  React.useEffect(() => { if (idx >= slides.length) setIdx(0); }, [slides.length, idx]);

  const go = (d) => setIdx((idx + d + slides.length) % slides.length);

  React.useEffect(() => {
    const h = (e) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [idx]);

  return (
    <div className="carousel-holder">
      <div className="slide-counter">{String(idx+1).padStart(2,'0')} / {String(slides.length).padStart(2,'0')} · {slides[idx].kind}</div>
      <button className="nav-arrow prev" onClick={() => go(-1)}>‹</button>
      <ScaledSlide>
        <Slide template={template} slide={slides[idx]} idx={idx} total={slides.length} {...state} />
      </ScaledSlide>
      <button className="nav-arrow next" onClick={() => go(1)}>›</button>
      <div className="dots-nav">
        {slides.map((_, i) => (
          <button key={i} className={i === idx ? 'active' : ''} onClick={() => setIdx(i)} />
        ))}
      </div>
    </div>
  );
}

function Overview({ template, slides, state, onOpen }) {
  return (
    <div className="grid-view">
      <div className="grid-inner">
        {slides.map((s, i) => (
          <GridThumb key={i} template={template} slide={s} idx={i} total={slides.length} state={state} onClick={() => onOpen(i)} />
        ))}
      </div>
    </div>
  );
}

function App() {
  const [tweaks, setTweaks] = useLocalState('igt-tweaks', DEFAULT_TWEAKS);
  const [tweaksAvailable, setTweaksAvailable] = React.useState(false);

  // Tweaks protocol — support host toggle
  React.useEffect(() => {
    const handler = (e) => {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === '__activate_edit_mode') setTweaksAvailable(true);
      if (e.data.type === '__deactivate_edit_mode') setTweaksAvailable(false);
    };
    window.addEventListener('message', handler);
    try {
      window.parent.postMessage({type:'__edit_mode_available'}, '*');
    } catch(e){}
    return () => window.removeEventListener('message', handler);
  }, []);

  const template = TEMPLATES.find(t => t.id === tweaks.templateId) || TEMPLATES[0];
  const state = {
    handle: tweaks.handle,
    year: tweaks.year,
    mode: tweaks.mode,
    markVariant: tweaks.markVariant,
    customAccent: tweaks.customAccent,
  };

  const [jumpTo, setJumpTo] = React.useState(null);
  React.useEffect(() => {
    if (jumpTo !== null) {
      try { localStorage.setItem('igt-idx', String(jumpTo)); } catch(e){}
      setJumpTo(null);
    }
  }, [jumpTo]);

  const set = (k, v) => setTweaks({ ...tweaks, [k]: v });

  return (
    <div className="app-shell" data-screen-label="Instagram Carousel Templates">
      <main className="main-stage">
        <div className="top-bar">
          <div className="brand"><span className="brand-dot" /> Social&nbsp;Studio</div>
          <div className="template-meta">igt · carousel_builder · v0.1</div>
          <div className="template-pills">
            {TEMPLATES.map(t => (
              <button
                key={t.id}
                className={tweaks.templateId === t.id ? 'active' : ''}
                onClick={() => set('templateId', t.id)}>
                {t.name}
              </button>
            ))}
          </div>
          <div className="view-toggle">
            <button className={tweaks.viewMode === 'carousel' ? 'active' : ''} onClick={() => set('viewMode','carousel')}>Carousel</button>
            <button className={tweaks.viewMode === 'grid' ? 'active' : ''} onClick={() => set('viewMode','grid')}>Overview</button>
          </div>
        </div>
        <div className="stage">
          <div className="phone-frame">
            {tweaks.viewMode === 'carousel'
              ? <Carousel template={template} slides={SAMPLE_SLIDES} state={state} />
              : <Overview template={template} slides={SAMPLE_SLIDES} state={state} onOpen={(i) => { setJumpTo(i); set('viewMode','carousel'); }} />
            }
          </div>
        </div>
      </main>
      <Sidebar tweaks={tweaks} setTweaks={setTweaks} template={template} />
    </div>
  );
}

window.App = App;
