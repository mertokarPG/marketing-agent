// The demo carousel — a small-brand example. Speciality coffee studio.
// Each slide has a "kind" and loose content — each template renders it in its own voice.

const SAMPLE_SLIDES = [
  {
    kind: 'cover',
    eyebrow: 'Issue № 04',
    kicker: 'A field guide',
    title: 'The quiet ritual of pour-over coffee',
    subtitle: 'Five things we learned roasting 200 lbs of single-origin beans in our garage.',
    cta: 'Swipe →',
  },
  {
    kind: 'intro',
    eyebrow: 'Context',
    title: 'Why slow coffee is making a comeback',
    body: 'In a year of 40-second everything, the four-minute pour became our most-requested drink. Here is what the data — and our regulars — told us about the shift.',
    meta: '3 min read',
  },
  {
    kind: 'numbered',
    number: '01',
    label: 'Principle',
    title: 'Water matters more than the bean',
    body: 'Filtered water at 94°C produces measurably sweeter extractions. We tested 12 sources — the difference between tap and remineralised was larger than the difference between two roast levels.',
  },
  {
    kind: 'stat',
    big: '4:12',
    unit: 'minutes',
    caption: 'The pour time that scored highest across 340 blind tastings this quarter.',
    footnote: 'Median across Kalita, V60, and Origami brewers.',
  },
  {
    kind: 'list',
    title: 'The kit we actually use',
    items: [
      { n: '01', label: 'Kettle', v: 'Fellow Stagg EKG' },
      { n: '02', label: 'Grinder', v: 'Comandante C40' },
      { n: '03', label: 'Scale', v: 'Acaia Pearl S' },
      { n: '04', label: 'Brewer', v: 'Origami M' },
      { n: '05', label: 'Filter', v: 'Cafec Abaca' },
      { n: '06', label: 'Cloth', v: 'Linen, natural' },
    ],
  },
  {
    kind: 'image',
    title: 'Bloom, then pour',
    caption: 'Wet the grounds with twice their weight in water. Wait 35 seconds. This releases CO₂ and unlocks clarity in the cup.',
    imageLabel: 'pour-over photograph',
  },
  {
    kind: 'cta',
    title: 'Save this for your next Sunday',
    body: 'We publish a new field guide every other Friday. Follow for the next one — a study of milk.',
    handleCta: 'Follow for more',
    saveCta: 'Save for later',
  },
];

window.SAMPLE_SLIDES = SAMPLE_SLIDES;
