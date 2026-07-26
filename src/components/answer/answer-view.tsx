'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion, useInView } from 'framer-motion';
import { ArrowLeft, ArrowUp, ArrowUpRight, ChevronUp } from 'lucide-react';

import { Atmosphere } from '@/components/overlays/atmosphere';
import { scrollTo } from '@/components/providers/smooth-scroll';
import {
  ConfidenceDial,
  InstrumentLabel,
  PulseDot,
  Reveal,
  StaggerGroup,
  StaggerItem,
  StatusPill,
} from '@/components/ui';
import { ANSWER, FOOTER } from '@/lib/content';
import { usePrefersReducedMotion } from '@/lib/hooks';
import {
  EASE,
  SPRING_SNAP,
  VIEWPORT,
  drawPath,
  pickVariants,
  riseInFlat,
  stagger,
} from '@/lib/motion';
import { pulseScene } from '@/lib/scene-state';
import { cn, formatFull } from '@/lib/utils';

/* ══════════════════════════════════════════════════════════════════════════
   DERIVED DATA
   Everything below is a pure function of ANSWER, so it is computed once at
   module scope rather than re-derived on every render.
   ══════════════════════════════════════════════════════════════════════════ */

type LayerId = (typeof ANSWER.layers)[number]['id'];

const LAYER_IDS = ANSWER.layers.map((l) => l.id);

/** Header counters, so the readouts can never drift from the data. */
const TOTALS = ANSWER.evidence.reduce(
  (acc, e) => ({
    support: acc.support + e.support,
    dispute: acc.dispute + e.dispute,
  }),
  { support: 0, dispute: 0 },
);

/** Citations whose confidence is still moving get the living-citation pulse. */
const LIVE_STATUSES = new Set<string>(['contested', 'under review']);

/* -- Reasoning map geometry ------------------------------------------------
   Node coordinates arrive as 0–100 percentages. They are projected into a
   fixed viewBox with an inset so the outermost nodes (x=6, x=94) keep room for
   their labels instead of being clipped by the frame. */

const MAP_W = 1000;
const MAP_H = 284;
const MAP_INSET_X = 80;
/** Room below the lowest node for its label plus descenders. */
const MAP_PAD_Y = 42;

const mapX = (x: number) => MAP_INSET_X + (x / 100) * (MAP_W - MAP_INSET_X * 2);

/* The vertical axis maps the *occupied* band, not the nominal 0–100 range.
   Node y values only ever span 22–78, so projecting the full range left a third
   of the SVG empty above and below the graph — roughly 250px of dead space on a
   desktop viewport. Deriving the bounds from the data keeps it tight if the
   node set is ever edited. */
const NODE_YS = ANSWER.reasoning.nodes.map((n) => n.y);
const NODE_MIN_Y = Math.min(...NODE_YS);
const NODE_MAX_Y = Math.max(...NODE_YS);

const mapY = (y: number) => {
  const span = NODE_MAX_Y - NODE_MIN_Y || 1;
  const t = (y - NODE_MIN_Y) / span;
  return MAP_PAD_Y + t * (MAP_H - MAP_PAD_Y * 2);
};

type ReasoningNode = (typeof ANSWER.reasoning.nodes)[number];

const NODE_BY_ID = new Map<string, ReasoningNode>(
  ANSWER.reasoning.nodes.map((n) => [n.id, n]),
);

/** Undirected adjacency — decides which edges stay lit while a node is held. */
const ADJACENCY = new Map<string, Set<string>>();
for (const [from, to] of ANSWER.reasoning.edges) {
  if (!ADJACENCY.has(from)) ADJACENCY.set(from, new Set());
  if (!ADJACENCY.has(to)) ADJACENCY.set(to, new Set());
  ADJACENCY.get(from)!.add(to);
  ADJACENCY.get(to)!.add(from);
}

/** Hop count from the root. Staggering by depth rather than array order is
 *  what makes the draw-in and the pulse read as propagation instead of a
 *  list of lines animating in sequence. */
const DEPTH = (() => {
  const depths = new Map<string, number>();
  const root = ANSWER.reasoning.nodes.find((n) => n.kind === 'root');
  if (!root) return depths;
  depths.set(root.id, 0);
  const queue: string[] = [root.id];
  while (queue.length) {
    const current = queue.shift()!;
    for (const [from, to] of ANSWER.reasoning.edges) {
      if (from !== current || depths.has(to)) continue;
      depths.set(to, (depths.get(current) ?? 0) + 1);
      queue.push(to);
    }
  }
  return depths;
})();

const EDGES = ANSWER.reasoning.edges.map(([from, to]) => {
  const a = NODE_BY_ID.get(from)!;
  const b = NODE_BY_ID.get(to)!;
  const x1 = mapX(a.x);
  const y1 = mapY(a.y);
  const x2 = mapX(b.x);
  const y2 = mapY(b.y);
  // Control points offset purely on X give every edge a horizontal tangent at
  // both ends, so the graph reads as left-to-right flow rather than a web.
  const bow = (x2 - x1) * 0.46;
  return {
    key: `${from}-${to}`,
    from,
    to,
    depth: DEPTH.get(from) ?? 0,
    d: `M ${x1} ${y1} C ${x1 + bow} ${y1}, ${x2 - bow} ${y2}, ${x2} ${y2}`,
  };
});

const PULSE_DURATION = 1;
const PULSE_STEP = 0.38;
const PULSE_CYCLE = 4.6;

/* -- Timeline geometry -----------------------------------------------------
   Confidence spans 40 → 94 here. Plotted against a full 0–100 axis the curve
   flattens into a near-straight line and the 2021 retreat disappears, so the
   vertical domain is clipped to 30–100. */

const TL_W = 1000;
const TL_H = 200;
const TL_INSET_X = 44;
const TL_TOP = 26;
/** The plot floor is the viewBox floor, so the filled area and the dropped
 *  guide meet the DOM axis hairline that sits immediately below the SVG. */
const TL_BASE = TL_H;
const TL_MIN = 30;
const TL_MAX = 100;

const TL_POINTS = ANSWER.timeline.map((entry, i) => {
  const t = i / (ANSWER.timeline.length - 1);
  const x = TL_INSET_X + t * (TL_W - TL_INSET_X * 2);
  const y =
    TL_TOP +
    (1 - (entry.confidence - TL_MIN) / (TL_MAX - TL_MIN)) * (TL_BASE - TL_TOP);
  return { x, y, pct: (x / TL_W) * 100, entry };
});

const TL_LINE = TL_POINTS.map(
  (p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
).join(' ');

const TL_AREA = `${TL_LINE} L ${TL_POINTS[TL_POINTS.length - 1].x.toFixed(1)} ${TL_BASE} L ${TL_POINTS[0].x.toFixed(1)} ${TL_BASE} Z`;

/** Page frame: gutter, centring, and the cap that stops the dense instrument
 *  rows from stretching to 1800px on an ultrawide display. */
const SHELL = 'gutter mx-auto w-full max-w-[92rem]';

/* ══════════════════════════════════════════════════════════════════════════
   VIEW
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The answer surface.
 *
 * Eight layers of one answer, stacked vertically and indexed by a rail that
 * tracks the reader's position. The page is an argument that an answer is a
 * structure rather than a paragraph, so the chrome is deliberately
 * instrument-like: mono indices, hairline rules, meters instead of adjectives,
 * and exactly one crossfade — where the register changes.
 */
export function AnswerView() {
  const [active, setActive] = useState<LayerId>('summary');
  const [draft, setDraft] = useState('');
  const followUpRef = useRef<HTMLInputElement>(null);

  /* -- Active layer -------------------------------------------------------
     A thin observation band sits between 15% and 40% of the viewport height;
     whichever section overlaps it owns the rail. Keeping the intersecting set
     in a closure and picking the first in document order keeps the active
     layer stable while scrolling through a section taller than the band. */
  useEffect(() => {
    const visible = new Set<string>();
    const sections = LAYER_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => Boolean(el),
    );
    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const first = LAYER_IDS.find((id) => visible.has(id));
        if (first) setActive(first);
      },
      { rootMargin: '-15% 0px -60% 0px', threshold: 0 },
    );

    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const goToLayer = useCallback((id: LayerId) => {
    scrollTo(`#${id}`, -112);
  }, []);

  /** Related rows do not navigate — they load the follow-up field, which keeps
   *  every interactive affordance on this page pointed at the same place.
   *
   *  Loading a field is not a commit, so no scene pulse fires here (and there
   *  is no WebGL core on this route to receive one). The field does have to be
   *  brought into view: at lg+ it sits at the very bottom of the column, far
   *  below the Related grid, and `preventScroll` deliberately stops the browser
   *  from doing it. Below lg the bar is fixed to the bottom edge and already on
   *  screen — scrolling to a fixed element would throw the page down a whole
   *  viewport for nothing. */
  const askAbout = useCallback((title: string) => {
    setDraft(title);
    const bar = document.getElementById('follow-up');
    if (bar && getComputedStyle(bar).position !== 'fixed') {
      // The app's own scroller, so this does not fight Lenis.
      scrollTo('#follow-up', -160);
    }
    followUpRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <>
      <Atmosphere />

      {/* The root layout's skip link targets #main on every route. */}
      <main id="main" className="relative z-10 pb-28 lg:pb-0">
        <AnswerHeader />

        <ChipStrip active={active} onSelect={goToLayer} />

        <div className={SHELL}>
          <div className="grid grid-cols-1 gap-x-14 xl:grid-cols-[12.5rem_minmax(0,1fr)] 2xl:gap-x-20">
            <LayerRail active={active} onSelect={goToLayer} />

            <div className="min-w-0 pb-16 xl:pb-24">
              <SummaryLayer />
              <EvidenceLayer />
              <SourcesLayer />
              <ReasoningLayer />
              <CommunityLayer />
              <TimelineLayer />
              <ConflictLayer />
              <RelatedLayer onAsk={askAbout} />

              <FollowUpBar
                inputRef={followUpRef}
                value={draft}
                onChange={setDraft}
              />

              <p className="mt-16 hidden max-w-[54ch] font-mono text-[0.625rem] leading-relaxed tracking-[0.14em] text-text-4 uppercase lg:block">
                {FOOTER.legal}
              </p>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   HEADER
   ══════════════════════════════════════════════════════════════════════════ */

function AnswerHeader() {
  const words = ANSWER.query.split(' ');
  const lead = words.slice(0, -1).join(' ');
  const accent = words[words.length - 1];

  return (
    <header className={cn(SHELL, 'relative pt-24 pb-12 sm:pt-28 lg:pt-32')}>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: EASE.outExpo }}
      >
        <Link
          href="/"
          className="group inline-flex items-center gap-2.5 text-text-3 transition-colors duration-300 hover:text-text-1"
        >
          <ArrowLeft
            className="size-3.5 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-x-1"
            strokeWidth={1.75}
            aria-hidden
          />
          <span className="label text-current">Back to the Core</span>
        </Link>
      </motion.div>

      <div className="mt-10 grid gap-12 lg:mt-14 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-16">
        <div>
          <motion.div
            className="flex flex-wrap items-center gap-x-4 gap-y-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.12, ease: EASE.outExpo }}
          >
            <span className="label tnum text-blue-soft/70">ANSWER</span>
            <span aria-hidden className="h-px w-8 bg-line-strong" />
            <span className="tnum inline-flex items-center rounded-full border border-line-strong bg-white/4 px-2.5 py-1 font-mono text-[0.625rem] tracking-[0.16em] text-text-2 uppercase">
              Revision {ANSWER.revision}
            </span>
          </motion.div>

          <h1 className="mt-6 text-h2 font-sans font-medium">
            <motion.span
              className="block"
              initial={{ opacity: 0, y: 26, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 1.1, delay: 0.2, ease: EASE.outExpo }}
            >
              <span className="text-lume">{lead}</span>{' '}
              <em className="text-accent-lume font-serif italic">{accent}</em>
            </motion.span>
          </h1>

          <motion.div
            className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.5 }}
          >
            <span className="inline-flex items-center gap-2.5">
              <PulseDot />
              <span className="label text-text-2">
                Refined {ANSWER.lastRefined}
              </span>
            </span>
            <MetaDot />
            <span className="label tnum">
              {formatFull(ANSWER.contributors)} contributors
            </span>
            <MetaDot />
            <span className="label tnum">
              {ANSWER.layers.length} layers · {ANSWER.sources.length} sources
            </span>
          </motion.div>
        </div>

        <motion.div
          className="flex items-center gap-8 lg:justify-end"
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.35, ease: EASE.outExpo }}
        >
          <div className="hidden flex-col items-end gap-1.5 sm:flex lg:hidden xl:flex">
            <span className="label">Support</span>
            <span className="tnum font-mono text-sm text-cyan">
              {TOTALS.support}
            </span>
            <span className="label mt-3">Disputed</span>
            <span className="tnum font-mono text-sm text-amber">
              {TOTALS.dispute}
            </span>
          </div>
          <ConfidenceDial value={ANSWER.confidence} size={132} />
        </motion.div>
      </div>
    </header>
  );
}

function MetaDot() {
  return <span aria-hidden className="size-1 rounded-full bg-text-4" />;
}

/* ══════════════════════════════════════════════════════════════════════════
   INDEX — sticky rail (xl) and scrollable chip strip (below xl)
   ══════════════════════════════════════════════════════════════════════════ */

function LayerRail({
  active,
  onSelect,
}: {
  active: LayerId;
  onSelect: (id: LayerId) => void;
}) {
  return (
    <aside className="hidden xl:block">
      <nav className="sticky top-24" aria-label="Answer layers">
        <span className="label">Layers</span>

        <ul className="relative mt-6 border-l border-line">
          {ANSWER.layers.map((layer) => {
            const isActive = layer.id === active;
            return (
              <li key={layer.id} className="relative">
                {isActive && (
                  <motion.span
                    layoutId="rail-lit"
                    aria-hidden
                    className="absolute top-0 -left-px bottom-0 w-px bg-blue-soft shadow-[0_0_12px_1px_rgba(110,144,255,0.7)]"
                    transition={SPRING_SNAP}
                  />
                )}
                <button
                  type="button"
                  onClick={() => onSelect(layer.id)}
                  aria-current={isActive ? 'location' : undefined}
                  className="group flex w-full items-center gap-3 py-2.5 pl-4 text-left"
                >
                  <span
                    className={cn(
                      'label tnum transition-colors duration-300',
                      isActive ? 'text-blue-soft' : 'text-text-4',
                    )}
                  >
                    {layer.index}
                  </span>
                  <span
                    className={cn(
                      'text-xs transition-colors duration-300',
                      isActive
                        ? 'text-text-1'
                        : 'text-text-3 group-hover:text-text-2',
                    )}
                  >
                    {layer.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="rule mt-6" aria-hidden />

        <div className="mt-5 flex items-center gap-2.5">
          <PulseDot />
          <span className="label">Live answer</span>
        </div>
      </nav>
    </aside>
  );
}

function ChipStrip({
  active,
  onSelect,
}: {
  active: LayerId;
  onSelect: (id: LayerId) => void;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Centre the active chip by writing scrollLeft directly. scrollIntoView would
  // hand the vertical axis to the browser and fight Lenis for the page scroll.
  useEffect(() => {
    const strip = stripRef.current;
    const chip = chipRefs.current[active];
    if (!strip || !chip) return;
    strip.scrollTo({
      left: chip.offsetLeft - strip.clientWidth / 2 + chip.offsetWidth / 2,
      behavior: 'smooth',
    });
  }, [active]);

  return (
    <div className="sticky top-0 z-30 border-y border-line bg-void/80 backdrop-blur-xl xl:hidden">
      <div
        ref={stripRef}
        className="relative overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <nav
          className="gutter flex w-max items-center gap-1.5 py-2.5"
          aria-label="Answer layers"
        >
          {ANSWER.layers.map((layer) => {
            const isActive = layer.id === active;
            return (
              <button
                key={layer.id}
                type="button"
                ref={(el) => {
                  chipRefs.current[layer.id] = el;
                }}
                onClick={() => onSelect(layer.id)}
                aria-current={isActive ? 'location' : undefined}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5',
                  'transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
                  isActive
                    ? 'border-blue-soft/45 bg-blue/12'
                    : 'border-line hover:border-line-strong',
                )}
              >
                <span
                  className={cn(
                    'label tnum',
                    isActive ? 'text-blue-soft' : 'text-text-4',
                  )}
                >
                  {layer.index}
                </span>
                <span
                  className={cn(
                    'label whitespace-nowrap',
                    isActive ? 'text-text-1' : 'text-text-3',
                  )}
                >
                  {layer.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   LAYER FRAME
   ══════════════════════════════════════════════════════════════════════════ */

function Layer({
  id,
  index,
  label,
  aside,
  children,
}: {
  id: LayerId;
  index: string;
  label: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-28 border-t border-line py-14 first:border-t-0 first:pt-4 sm:py-16 lg:py-20"
    >
      {/* The instrument eyebrow is a styled row, not a heading, so the document
          outline needs a real one — eight sections of long-form reading are
          otherwise unreachable by heading navigation. The eyebrow then repeats
          it visually, so it is hidden from assistive tech to avoid the stutter;
          the aside beside it stays announced. */}
      <h2 className="sr-only">{label}</h2>

      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
        <div aria-hidden>
          <InstrumentLabel index={index}>{label}</InstrumentLabel>
        </div>
        {aside && <Reveal variants={riseInFlat}>{aside}</Reveal>}
      </div>

      <div className="mt-9 sm:mt-11">{children}</div>
    </section>
  );
}

/** The small mono counter that sits opposite each layer's instrument label. */
function LayerCount({ children }: { children: ReactNode }) {
  return (
    <span className="tnum font-mono text-[0.625rem] tracking-[0.16em] text-text-4 uppercase">
      {children}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   01 — SUMMARY
   ══════════════════════════════════════════════════════════════════════════ */

const REGISTERS = [
  { key: 'plain', label: 'Plain language', text: ANSWER.plainLanguage },
  { key: 'technical', label: 'Technical', text: ANSWER.summary },
] as const;

const SUMMARY_READOUT = [
  { label: 'Claims held', value: ANSWER.evidence.length },
  { label: 'Supporting', value: TOTALS.support },
  { label: 'Disputing', value: TOTALS.dispute },
  { label: 'Sources', value: ANSWER.sources.length },
  { label: 'Corrections', value: ANSWER.community.corrections.length },
];

function SummaryLayer() {
  const [register, setRegister] = useState<'plain' | 'technical'>('technical');

  return (
    <Layer
      id="summary"
      index={ANSWER.layers[0].index}
      label={ANSWER.layers[0].label}
      aside={<LayerCount>Confidence {ANSWER.confidence}%</LayerCount>}
    >
      <div className="grid gap-14 xl:grid-cols-[minmax(0,1fr)_13rem] xl:gap-16">
        <Reveal>
          {/* Both registers share one grid cell so the crossfade cannot shift
              layout — the container simply holds the taller of the two. */}
          <div className="measure grid">
            {REGISTERS.map((r) => {
              const shown = r.key === register;
              return (
                <motion.p
                  key={r.key}
                  className="col-start-1 row-start-1 text-lead text-text-1"
                  initial={false}
                  animate={{
                    opacity: shown ? 1 : 0,
                    filter: shown ? 'blur(0px)' : 'blur(7px)',
                    y: shown ? 0 : 8,
                  }}
                  transition={{ duration: 0.46, ease: EASE.outExpo }}
                  aria-hidden={!shown}
                  style={{ pointerEvents: shown ? 'auto' : 'none' }}
                >
                  {r.text}
                </motion.p>
              );
            })}
          </div>

          <div className="rule measure mt-9" aria-hidden />

          <div className="measure mt-6 flex flex-wrap items-center justify-between gap-4">
            <span className="label">Register</span>

            <div className="relative inline-flex items-center gap-1 rounded-full border border-line p-1">
              {REGISTERS.map((r) => {
                const shown = r.key === register;
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setRegister(r.key)}
                    aria-pressed={shown}
                    className="relative rounded-full px-3.5 py-1.5"
                  >
                    {shown && (
                      <motion.span
                        layoutId="register-lit"
                        aria-hidden
                        className="absolute inset-0 rounded-full border border-line-strong bg-white/6"
                        transition={SPRING_SNAP}
                      />
                    )}
                    <span
                      className={cn(
                        'label relative whitespace-nowrap transition-colors duration-300',
                        shown ? 'text-text-1' : 'text-text-3',
                      )}
                    >
                      {r.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </Reveal>

        <StaggerGroup className="hidden self-start xl:block" as="ul" gap={0.07}>
          {SUMMARY_READOUT.map((row) => (
            <StaggerItem
              key={row.label}
              as="li"
              variants={riseInFlat}
              className="flex items-baseline justify-between border-t border-line py-3 last:border-b last:border-b-line"
            >
              <span className="label">{row.label}</span>
              <span className="tnum font-mono text-sm text-text-1">
                {row.value}
              </span>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </Layer>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   02 — EVIDENCE
   ══════════════════════════════════════════════════════════════════════════ */

function EvidenceLayer() {
  return (
    <Layer
      id="evidence"
      index={ANSWER.layers[1].index}
      label={ANSWER.layers[1].label}
      aside={
        <LayerCount>
          {ANSWER.evidence.length} claims · {TOTALS.support} support ·{' '}
          {TOTALS.dispute} dispute
        </LayerCount>
      }
    >
      <StaggerGroup as="ul" gap={0.08} className="border-b border-line">
        {ANSWER.evidence.map((item, i) => (
          <StaggerItem
            key={item.claim}
            as="li"
            variants={riseInFlat}
            className="grid gap-x-8 gap-y-5 border-t border-line py-7 md:grid-cols-[2.25rem_minmax(0,1fr)_8.5rem] md:py-8"
          >
            <span className="label tnum pt-1 text-blue-soft/70">
              {String(i + 1).padStart(2, '0')}
            </span>

            <div className="min-w-0">
              <p className="max-w-[46ch] text-[1.0625rem] leading-snug text-text-1">
                {item.claim}
              </p>
              <p className="mt-2.5 max-w-[52ch] text-sm text-text-3">
                {item.basis}
              </p>

              <div className="mt-5 flex items-center gap-4">
                <StrengthBar value={item.strength} />
                <span className="tnum shrink-0 font-mono text-xs text-text-2">
                  {item.strength}
                  <span className="text-text-4">%</span>
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-start gap-2 md:flex-col md:items-end">
              <CountPill tone="support" value={item.support} />
              <CountPill tone="dispute" value={item.dispute} />
            </div>
          </StaggerItem>
        ))}
      </StaggerGroup>
    </Layer>
  );
}

/** A hairline meter with a lit head. Draws from the left as it enters view. */
function StrengthBar({ value }: { value: number }) {
  return (
    <div
      className="relative h-px w-full max-w-md bg-line"
      role="meter"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Evidence strength"
    >
      <motion.span
        aria-hidden
        className="absolute inset-y-0 left-0 block origin-left bg-gradient-to-r from-blue via-blue-soft to-cyan"
        style={{ width: `${value}%` }}
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={VIEWPORT}
        transition={{ duration: 1.25, ease: EASE.outExpo }}
      />
      <motion.span
        aria-hidden
        className="absolute top-1/2 block size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan shadow-[0_0_10px_2px_rgba(110,231,245,0.6)]"
        style={{ left: `${value}%` }}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={VIEWPORT}
        transition={{ duration: 0.5, delay: 0.85, ease: EASE.outExpo }}
      />
    </div>
  );
}

function CountPill({
  tone,
  value,
}: {
  tone: 'support' | 'dispute';
  value: number;
}) {
  const muted = value === 0;
  return (
    <span
      className={cn(
        'tnum inline-flex items-center gap-2 rounded-full border px-2.5 py-1',
        'font-mono text-[0.625rem] tracking-[0.14em] uppercase',
        muted && 'border-line text-text-4',
        !muted && tone === 'support' && 'border-cyan/25 bg-cyan/8 text-cyan',
        !muted && tone === 'dispute' && 'border-amber/25 bg-amber/8 text-amber',
      )}
    >
      <span aria-hidden className="size-1 rounded-full bg-current" />
      {value} {tone}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   03 — SOURCES
   ══════════════════════════════════════════════════════════════════════════ */

function SourcesLayer() {
  const liveCount = ANSWER.sources.filter((s) =>
    LIVE_STATUSES.has(s.status),
  ).length;

  return (
    <Layer
      id="sources"
      index={ANSWER.layers[2].index}
      label={ANSWER.layers[2].label}
      aside={
        <LayerCount>
          {ANSWER.sources.length} cited · {liveCount} still moving
        </LayerCount>
      }
    >
      <StaggerGroup as="ul" gap={0.07} className="border-b border-line">
        {ANSWER.sources.map((source) => {
          const live = LIVE_STATUSES.has(source.status);
          return (
            <StaggerItem
              key={source.title}
              as="li"
              variants={riseInFlat}
              className="relative grid gap-x-10 gap-y-5 border-t border-line py-7 md:grid-cols-[minmax(0,1fr)_11rem] md:py-8"
            >
              {/* Living citation: a light travelling along the row's hairline
                  whenever that source's weight is still being re-scored. */}
              {live && (
                <span
                  aria-hidden
                  className="animate-shimmer pointer-events-none absolute inset-x-0 top-0 h-px"
                  style={{
                    background:
                      'linear-gradient(90deg, transparent, var(--color-amber), transparent)',
                    backgroundSize: '32% 100%',
                    backgroundRepeat: 'no-repeat',
                  }}
                />
              )}

              <div className="min-w-0">
                <h3 className="max-w-[44ch] text-[1.0625rem] leading-snug text-text-1">
                  {source.title}
                </h3>

                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="label">{source.kind}</span>
                  <MetaDot />
                  <span className="label tnum">{source.year}</span>
                  {live && (
                    <>
                      <MetaDot />
                      <span className="label text-amber/80">
                        Living citation
                      </span>
                    </>
                  )}
                </div>

                <p className="mt-3.5 max-w-[58ch] text-sm text-text-3">
                  {source.note}
                </p>
              </div>

              <div className="flex items-center justify-between gap-6 md:flex-col md:items-end md:justify-start md:gap-5">
                <StatusPill tone={source.status}>{source.status}</StatusPill>

                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-baseline gap-1.5">
                    <span className="tnum font-mono text-lg text-text-1">
                      {source.weight}
                    </span>
                    <span className="label">weight</span>
                  </div>
                  <span className="block h-px w-16 bg-line">
                    <motion.span
                      aria-hidden
                      className="block h-px origin-left bg-text-2"
                      style={{ width: `${source.weight}%` }}
                      initial={{ scaleX: 0 }}
                      whileInView={{ scaleX: 1 }}
                      viewport={VIEWPORT}
                      transition={{ duration: 1, ease: EASE.outExpo }}
                    />
                  </span>
                </div>
              </div>
            </StaggerItem>
          );
        })}
      </StaggerGroup>
    </Layer>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   04 — REASONING MAP
   ══════════════════════════════════════════════════════════════════════════ */

function ReasoningLayer() {
  const reduced = usePrefersReducedMotion();
  const frameRef = useRef<HTMLDivElement>(null);
  // The observer is attached to the wrapping div, not the SVG: an
  // IntersectionObserver on <g> / <clipPath> children is unreliable, and
  // elements inside <defs> never intersect anything at all.
  const inView = useInView(frameRef, { once: true, amount: 0.2 });
  const [held, setHeld] = useState<string | null>(null);

  const neighbours = held ? ADJACENCY.get(held) : undefined;

  return (
    <Layer
      id="reasoning"
      index={ANSWER.layers[3].index}
      label={ANSWER.layers[3].label}
      aside={
        <LayerCount>
          {ANSWER.reasoning.nodes.length} nodes ·{' '}
          {ANSWER.reasoning.edges.length} edges
        </LayerCount>
      }
    >
      <Reveal>
        <p className="measure text-sm text-text-3">
          The concepts the Core traversed, in the order it traversed them. Hold
          a node to isolate its connections.
        </p>

        {/* The map is wider than a phone and its scrollbar is hidden, so
            without this there is nothing to tell you the path continues past
            the right edge. Shown only where it actually overflows. */}
        <p className="label mt-4 flex items-center gap-2 text-text-4 xl:hidden">
          <span aria-hidden>&rarr;</span>
          Drag the map sideways to follow the path
        </p>

        <div
          ref={frameRef}
          className="mt-6 overflow-x-auto [scrollbar-width:none] xl:mt-9 [&::-webkit-scrollbar]:hidden"
        >
          {/* Labels are sized in viewBox units, so scaling the map down to a
              phone width would scale them into illegibility. It scrolls. */}
          <div className="min-w-[880px]">
            <svg
              viewBox={`0 0 ${MAP_W} ${MAP_H}`}
              className="w-full"
              role="group"
              aria-label={`Reasoning map from the query to the composed answer, ${ANSWER.reasoning.nodes.length} nodes`}
            >
              <defs>
                <linearGradient id="reason-edge" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="var(--color-blue-deep)" />
                  <stop offset="100%" stopColor="var(--color-violet)" />
                </linearGradient>
                <linearGradient id="reason-pulse" x1="0" y1="0" x2="1" y2="0">
                  <stop
                    offset="0%"
                    stopColor="var(--color-cyan)"
                    stopOpacity="0"
                  />
                  <stop offset="60%" stopColor="var(--color-cyan)" />
                  <stop offset="100%" stopColor="var(--color-blue-soft)" />
                </linearGradient>
                <radialGradient id="reason-halo">
                  <stop
                    offset="0%"
                    stopColor="var(--color-blue-soft)"
                    stopOpacity="0.4"
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--color-blue-soft)"
                    stopOpacity="0"
                  />
                </radialGradient>
              </defs>

              {/* Edges. drawPath owns `opacity`, so the hover dim rides on
                  `stroke-opacity` instead — two animators on one property is
                  how these effects normally end up fighting each other. */}
              <motion.g
                initial="hidden"
                animate={inView ? 'visible' : 'hidden'}
                variants={stagger(0.045, 0.1)}
              >
                {EDGES.map((edge) => {
                  const dimmed =
                    held !== null && edge.from !== held && edge.to !== held;
                  return (
                    <motion.path
                      key={edge.key}
                      d={edge.d}
                      fill="none"
                      stroke="url(#reason-edge)"
                      strokeWidth={1.25}
                      strokeLinecap="round"
                      variants={pickVariants(reduced, drawPath)}
                      className="transition-[stroke-opacity] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
                      style={{ strokeOpacity: dimmed ? 0.12 : 0.85 }}
                    />
                  );
                })}
              </motion.g>

              {/* Travelling pulse, root to leaf.
                  The dash pattern totals more than the normalised path length
                  (0.14 + 2 > 1) on purpose: with a total of exactly 1 the
                  pattern wraps and a phantom second dash appears at the far end
                  of every edge. Delay by hop count so it propagates as a wave. */}
              {inView && !reduced && (
                <g>
                  {EDGES.map((edge) => {
                    const dimmed =
                      held !== null && edge.from !== held && edge.to !== held;
                    return (
                      <motion.path
                        key={`pulse-${edge.key}`}
                        d={edge.d}
                        fill="none"
                        pathLength={1}
                        stroke="url(#reason-pulse)"
                        strokeWidth={2.25}
                        strokeLinecap="round"
                        strokeDasharray="0.14 2"
                        initial={{ strokeDashoffset: 0.14 }}
                        animate={{ strokeDashoffset: -1 }}
                        transition={{
                          duration: PULSE_DURATION,
                          delay: 1.5 + edge.depth * PULSE_STEP,
                          repeat: Infinity,
                          repeatDelay: PULSE_CYCLE - PULSE_DURATION,
                          ease: 'linear',
                        }}
                        className="transition-opacity duration-500"
                        style={{ opacity: dimmed ? 0.08 : 1 }}
                      />
                    );
                  })}
                </g>
              )}

              {/* Nodes. Entrance and hover-fade live on two nested groups so
                  neither animator writes to the other's opacity. */}
              {ANSWER.reasoning.nodes.map((node, i) => {
                const cx = mapX(node.x);
                const cy = mapY(node.y);
                const isRoot = node.kind === 'root';
                const isLeaf = node.kind === 'leaf';
                const lit = held === node.id;
                const linked = Boolean(neighbours?.has(node.id));
                const faded = held !== null && !lit && !linked;

                return (
                  <motion.g
                    key={node.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: inView ? 1 : 0 }}
                    transition={{
                      duration: 0.55,
                      delay: reduced ? 0 : 0.4 + i * 0.055,
                      ease: EASE.outExpo,
                    }}
                  >
                    <motion.g
                      tabIndex={0}
                      role="button"
                      aria-label={`${node.label} — isolate its connections`}
                      onPointerEnter={() => setHeld(node.id)}
                      onPointerLeave={() => setHeld(null)}
                      onFocus={() => setHeld(node.id)}
                      onBlur={() => setHeld(null)}
                      className="cursor-pointer outline-none"
                      animate={{ opacity: faded ? 0.32 : 1 }}
                      transition={{ duration: 0.4, ease: EASE.outExpo }}
                    >
                      <circle cx={cx} cy={cy} r={30} fill="transparent" />

                      <motion.circle
                        cx={cx}
                        cy={cy}
                        r={36}
                        fill="url(#reason-halo)"
                        aria-hidden
                        initial={{ opacity: 0 }}
                        animate={{ opacity: lit ? 1 : 0 }}
                        transition={{ duration: 0.35 }}
                      />

                      {(isRoot || isLeaf) && (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={13}
                          fill="none"
                          strokeWidth={1}
                          className={
                            isRoot ? 'stroke-cyan/45' : 'stroke-violet-soft/55'
                          }
                        />
                      )}

                      <motion.circle
                        cx={cx}
                        cy={cy}
                        strokeWidth={1.25}
                        className={cn(
                          'transition-colors duration-300',
                          isRoot && 'fill-cyan stroke-cyan',
                          isLeaf && 'fill-text-1 stroke-text-1',
                          !isRoot &&
                            !isLeaf &&
                            (lit || linked
                              ? 'fill-void stroke-blue-soft'
                              : 'fill-void stroke-line-strong'),
                        )}
                        initial={{ r: 0 }}
                        animate={{ r: isRoot ? 5 : isLeaf ? 7 : 5.5 }}
                        transition={{
                          duration: 0.55,
                          delay: reduced ? 0 : 0.45 + i * 0.055,
                          ease: EASE.settle,
                        }}
                        style={
                          isRoot || isLeaf
                            ? {
                                filter:
                                  'drop-shadow(0 0 9px rgba(110,231,245,0.5))',
                              }
                            : undefined
                        }
                      />

                      <text
                        x={cx}
                        y={cy + (isRoot || isLeaf ? 33 : 27)}
                        textAnchor="middle"
                        fontSize={isRoot || isLeaf ? 12 : 13}
                        className={cn(
                          'font-mono transition-colors duration-300',
                          (isRoot || isLeaf) && 'uppercase',
                          lit || linked ? 'fill-text-1' : 'fill-text-2',
                        )}
                        style={{
                          letterSpacing: isRoot || isLeaf ? '0.18em' : '0.02em',
                        }}
                      >
                        {node.label}
                      </text>
                    </motion.g>
                  </motion.g>
                );
              })}
            </svg>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-line pt-5">
          <LegendMark tone="root">Query</LegendMark>
          <LegendMark tone="concept">Concept traversed</LegendMark>
          <LegendMark tone="leaf">Composed answer</LegendMark>
        </div>
      </Reveal>
    </Layer>
  );
}

function LegendMark({
  tone,
  children,
}: {
  tone: 'root' | 'concept' | 'leaf';
  children: ReactNode;
}) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        aria-hidden
        className={cn(
          'block rounded-full',
          tone === 'root' && 'size-2 bg-cyan',
          tone === 'concept' && 'size-2 border border-line-strong bg-void',
          tone === 'leaf' && 'size-2.5 bg-text-1',
        )}
      />
      <span className="label">{children}</span>
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   05 — COMMUNITY
   ══════════════════════════════════════════════════════════════════════════ */

function CommunityLayer() {
  const [votes, setVotes] = useState<Array<{ count: number; cast: boolean }>>(
    () =>
      ANSWER.community.discussion.map((d) => ({ count: d.votes, cast: false })),
  );

  const toggleVote = (index: number) => {
    const wasCast = votes[index].cast;
    setVotes((prev) =>
      prev.map((v, i) =>
        i === index ? { count: v.count + (v.cast ? -1 : 1), cast: !v.cast } : v,
      ),
    );
    // The wave fires only on the up-vote — retracting one is not a commit.
    if (!wasCast) pulseScene(0.4);
  };

  return (
    <Layer
      id="community"
      index={ANSWER.layers[4].index}
      label={ANSWER.layers[4].label}
      aside={
        <LayerCount>
          {ANSWER.community.corrections.length} corrections ·{' '}
          {ANSWER.community.discussion.length} comments
        </LayerCount>
      }
    >
      <div className="flex items-center gap-4">
        <span className="label text-text-2">Corrections</span>
        <span aria-hidden className="h-px flex-1 bg-line" />
      </div>

      <StaggerGroup as="ul" gap={0.08} className="mt-6 border-b border-line">
        {ANSWER.community.corrections.map((correction) => (
          <StaggerItem
            key={correction.change}
            as="li"
            variants={riseInFlat}
            className="grid gap-x-10 gap-y-4 border-t border-line py-6 lg:grid-cols-[13rem_minmax(0,1fr)_9rem]"
          >
            <div>
              <p className="text-sm text-text-1">{correction.author}</p>
              <p className="label mt-2">{correction.domain}</p>
              <p className="label mt-1.5 text-text-4">{correction.when}</p>
            </div>

            <div className="min-w-0">
              <p className="max-w-[58ch] text-[0.9375rem] leading-relaxed text-text-2">
                {correction.change}
              </p>
              <div className="mt-4">
                <QuorumPips
                  agree={correction.agree}
                  reviews={correction.reviews}
                />
              </div>
            </div>

            {/* items-start matters: a bare `flex` stretches its children, and
                StatusPill is inline-flex — it would grow to the full row
                height and render as a tall oval instead of a pill. */}
            <div className="lg:flex lg:items-start lg:justify-end">
              <StatusPill tone={correction.accepted ? 'merged' : 'rejected'}>
                {correction.accepted ? 'accepted' : 'rejected'}
              </StatusPill>
            </div>
          </StaggerItem>
        ))}
      </StaggerGroup>

      <div className="mt-14 flex items-center gap-4">
        <span className="label text-text-2">Discussion</span>
        <span aria-hidden className="h-px flex-1 bg-line" />
      </div>

      <StaggerGroup as="ul" gap={0.09} className="mt-6 lg:max-w-[62rem]">
        {ANSWER.community.discussion.map((comment, i) => {
          // The opening comment is the thread; everything after it is a reply,
          // so replies indent once and hang off a shared spine.
          const isReply = i > 0;
          const vote = votes[i];

          return (
            <StaggerItem
              key={comment.text}
              as="li"
              variants={riseInFlat}
              className={cn('relative', isReply && 'pl-6 sm:pl-12')}
            >
              {isReply && (
                <>
                  <span
                    aria-hidden
                    className="absolute top-0 bottom-0 left-0 w-px bg-line sm:left-5"
                  />
                  <span
                    aria-hidden
                    className="absolute top-[2.4rem] left-0 h-px w-4 bg-line sm:left-5 sm:w-6"
                  />
                </>
              )}

              <div
                className={cn('py-6', i === 0 ? 'pt-0' : 'border-t border-line')}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="text-sm text-text-1">{comment.author}</span>
                  <MetaDot />
                  <span className="label">{comment.region}</span>
                  <MetaDot />
                  <span className="label text-text-4">{comment.when}</span>
                </div>

                <p className="mt-3.5 max-w-[62ch] text-[0.9375rem] leading-relaxed text-text-2">
                  {comment.text}
                </p>

                <button
                  type="button"
                  onClick={() => toggleVote(i)}
                  aria-pressed={vote.cast}
                  aria-label={`Upvote this comment, currently ${vote.count} votes`}
                  className={cn(
                    'mt-5 inline-flex items-center gap-2 rounded-full border px-3 py-1.5',
                    'transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
                    vote.cast
                      ? 'border-cyan/35 bg-cyan/10 text-cyan'
                      : 'border-line text-text-3 hover:border-line-strong hover:text-text-1',
                  )}
                >
                  <ChevronUp className="size-3.5" strokeWidth={2} aria-hidden />
                  <motion.span
                    // Re-keying on the count replays the pop, which is the only
                    // confirmation the vote landed — nothing navigates.
                    key={vote.count}
                    className="tnum font-mono text-[0.6875rem] tracking-[0.1em]"
                    initial={{ scale: 1.3 }}
                    animate={{ scale: 1 }}
                    transition={SPRING_SNAP}
                  >
                    {formatFull(vote.count)}
                  </motion.span>
                </button>
              </div>
            </StaggerItem>
          );
        })}
      </StaggerGroup>
    </Layer>
  );
}

function QuorumPips({ agree, reviews }: { agree: number; reviews: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5" aria-hidden>
        {Array.from({ length: reviews }).map((_, i) => (
          <motion.span
            key={i}
            className={cn(
              'block size-1.5 rounded-full',
              i < agree
                ? 'bg-cyan shadow-[0_0_8px_rgba(110,231,245,0.6)]'
                : 'bg-white/12',
            )}
            initial={{ scale: 0, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={VIEWPORT}
            transition={{ duration: 0.4, delay: i * 0.06, ease: EASE.settle }}
          />
        ))}
      </div>
      <span className="tnum font-mono text-[0.625rem] tracking-[0.14em] text-text-4 uppercase">
        {agree}/{reviews} agree
      </span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   06 — TIMELINE
   ══════════════════════════════════════════════════════════════════════════ */

function TimelineLayer() {
  const reduced = usePrefersReducedMotion();
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInView = useInView(chartRef, { once: true, amount: 0.3 });
  const [active, setActive] = useState(ANSWER.timeline.length - 1);
  const point = TL_POINTS[active];

  return (
    <Layer
      id="timeline"
      index={ANSWER.layers[5].index}
      label={ANSWER.layers[5].label}
      aside={
        <LayerCount>
          {ANSWER.timeline[0].year} → {ANSWER.confidence}% confidence
        </LayerCount>
      }
    >
      {/* Horizontal instrument, lg and up */}
      <Reveal className="hidden lg:block">
        <div className="flex items-baseline justify-between">
          <span className="label">Confidence curve</span>
          <span className="label tnum">
            {TL_MIN}–{TL_MAX}% scale
          </span>
        </div>

        <div ref={chartRef} className="relative mt-5">
          <svg
            viewBox={`0 0 ${TL_W} ${TL_H}`}
            className="w-full"
            role="img"
            aria-label="Confidence in this answer over time, rising from 40 percent in 1994 to 94 percent now"
          >
            <defs>
              <linearGradient id="tl-area" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--color-blue)"
                  stopOpacity="0.32"
                />
                <stop
                  offset="100%"
                  stopColor="var(--color-blue)"
                  stopOpacity="0"
                />
              </linearGradient>
              <linearGradient id="tl-line" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--color-blue)" />
                <stop offset="55%" stopColor="var(--color-violet-soft)" />
                <stop offset="100%" stopColor="var(--color-cyan)" />
              </linearGradient>
              <clipPath id="tl-wipe">
                {/* The fill trails the pen: a longer wipe than the line draw
                    guarantees the area edge never runs ahead of the stroke. */}
                <motion.rect
                  x={0}
                  y={0}
                  height={TL_H}
                  initial={{ width: 0 }}
                  animate={{ width: chartInView ? TL_W : 0 }}
                  transition={{
                    duration: reduced ? 0 : 1.9,
                    ease: EASE.outExpo,
                  }}
                />
              </clipPath>
            </defs>

            <path
              d={TL_AREA}
              fill="url(#tl-area)"
              clipPath="url(#tl-wipe)"
              aria-hidden
            />

            <motion.path
              d={TL_LINE}
              fill="none"
              stroke="url(#tl-line)"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              initial="hidden"
              animate={chartInView ? 'visible' : 'hidden'}
              variants={pickVariants(reduced, drawPath)}
            />

            {/* Guide dropped from the active vertex to the axis. */}
            <motion.line
              x2={point.x}
              y2={TL_BASE}
              className="stroke-line-strong"
              strokeWidth={1}
              strokeDasharray="2 4"
              vectorEffect="non-scaling-stroke"
              initial={false}
              animate={{ x1: point.x, y1: point.y, x2: point.x }}
              transition={SPRING_SNAP}
              aria-hidden
            />

            {TL_POINTS.map((p, i) => (
              <motion.g
                key={p.entry.year}
                initial={{ opacity: 0 }}
                animate={{ opacity: chartInView ? 1 : 0 }}
                transition={{
                  duration: 0.4,
                  delay: reduced ? 0 : 0.55 + i * 0.12,
                  ease: EASE.outExpo,
                }}
              >
                <motion.circle
                  cx={p.x}
                  cy={p.y}
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                  className={cn(
                    'transition-colors duration-300',
                    i === active
                      ? 'fill-cyan stroke-cyan'
                      : 'fill-void stroke-blue-soft',
                  )}
                  initial={{ r: 0 }}
                  animate={{ r: i === active ? 5.5 : 3 }}
                  transition={SPRING_SNAP}
                  style={
                    i === active
                      ? { filter: 'drop-shadow(0 0 8px rgba(110,231,245,0.7))' }
                      : undefined
                  }
                />
              </motion.g>
            ))}
          </svg>

          {/* Axis + ticks, driven by the same x fractions as the curve. */}
          <div className="h-px w-full bg-line-strong" aria-hidden />

          <div className="relative h-20">
            {TL_POINTS.map((p, i) => {
              const isActive = i === active;
              return (
                <button
                  key={p.entry.year}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onClick={() => setActive(i)}
                  aria-pressed={isActive}
                  className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-2.5 px-3"
                  style={{ left: `${p.pct}%` }}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'block w-px transition-all duration-300',
                      isActive ? 'h-4 bg-cyan' : 'h-2.5 bg-line-strong',
                    )}
                  />
                  <span
                    className={cn(
                      'label tnum whitespace-nowrap transition-colors duration-300',
                      isActive ? 'text-text-1' : 'text-text-3',
                    )}
                  >
                    {p.entry.year}
                  </span>
                  <span
                    className={cn(
                      'tnum font-mono text-[0.625rem] transition-colors duration-300',
                      isActive ? 'text-cyan' : 'text-text-4',
                    )}
                  >
                    {p.entry.confidence}%
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-2 min-h-[9rem]">
            {/* Re-keying replays the entrance with no exit phase, so sweeping
                the pointer across the ticks never queues a backlog. */}
            <motion.div
              key={point.entry.year}
              className="glass-deep max-w-[46rem] rounded-lg px-7 py-6"
              initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.34, ease: EASE.outExpo }}
            >
              <div className="flex items-baseline gap-4">
                <span className="tnum font-mono text-sm text-cyan">
                  {point.entry.year}
                </span>
                <h3 className="text-h3 font-sans font-medium text-text-1">
                  {point.entry.title}
                </h3>
              </div>
              <p className="mt-3 max-w-[58ch] text-sm leading-relaxed text-text-2">
                {point.entry.body}
              </p>
            </motion.div>
          </div>
        </div>
      </Reveal>

      {/* Vertical list below lg */}
      <StaggerGroup
        as="ul"
        gap={0.07}
        className="border-b border-line lg:hidden"
      >
        {ANSWER.timeline.map((entry) => (
          <StaggerItem
            key={entry.year}
            as="li"
            variants={riseInFlat}
            className="border-t border-line py-6"
          >
            <div className="flex items-center gap-4">
              <span className="tnum font-mono text-sm text-cyan">
                {entry.year}
              </span>
              <span className="block h-px flex-1 bg-line">
                <motion.span
                  aria-hidden
                  className="block h-px origin-left bg-gradient-to-r from-blue to-cyan"
                  style={{ width: `${entry.confidence}%` }}
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={VIEWPORT}
                  transition={{ duration: 1, ease: EASE.outExpo }}
                />
              </span>
              <span className="tnum font-mono text-[0.6875rem] text-text-3">
                {entry.confidence}%
              </span>
            </div>
            <h3 className="mt-4 text-[1.0625rem] leading-snug text-text-1">
              {entry.title}
            </h3>
            <p className="mt-2 text-sm text-text-3">{entry.body}</p>
          </StaggerItem>
        ))}
      </StaggerGroup>
    </Layer>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   07 — CONFLICT
   ══════════════════════════════════════════════════════════════════════════ */

function ConflictLayer() {
  const [left, right] = ANSWER.conflict.positions;

  return (
    <Layer
      id="conflict"
      index={ANSWER.layers[6].index}
      label={ANSWER.layers[6].label}
      aside={<LayerCount>Held, not averaged</LayerCount>}
    >
      <Reveal>
        <p className="measure text-lead text-text-2">
          {ANSWER.conflict.summary}
        </p>
      </Reveal>

      <Reveal className="mt-14">
        {/* The stances sit at either end of the bar so the split reads as one
            measurement stretched between two positions, not two statistics. */}
        <div className="flex items-end justify-between gap-8">
          <div>
            <span className="label text-blue-soft">{left.stance}</span>
            <div className="tnum mt-2 font-mono text-h3 text-blue-soft">
              {left.weight}
              <span className="text-text-4">%</span>
            </div>
          </div>
          <div className="text-right">
            <span className="label text-amber">{right.stance}</span>
            <div className="tnum mt-2 font-mono text-h3 text-amber">
              {right.weight}
              <span className="text-text-4">%</span>
            </div>
          </div>
        </div>

        {/* The container is the in-view target, and the segments animate as its
            children.

            They must not observe themselves: a segment animating `scaleX` from
            0 has a zero-area bounding box, and a zero-area box can never
            register as intersecting — so `whileInView` never fires and the bar
            stays collapsed permanently. It resolved on wide viewports and
            failed on narrow ones, which is exactly the shape of a latent
            geometry race. Observing the full-width parent removes it. */}
        <motion.div
          className="mt-5 flex h-2 w-full gap-px overflow-hidden rounded-full"
          role="meter"
          aria-valuenow={left.weight}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Weight split: ${left.weight} per cent ${left.stance}, ${right.weight} per cent ${right.stance}`}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT}
        >
          {/* The half-pixel deductions absorb the 1px divider so the two
              segments still total exactly 100% and neither gets clipped. */}
          <motion.span
            className="block h-full origin-left bg-gradient-to-r from-blue-deep to-blue"
            style={{ width: `calc(${left.weight}% - 0.5px)` }}
            variants={{ hidden: { scaleX: 0 }, visible: { scaleX: 1 } }}
            transition={{ duration: 1.3, ease: EASE.outExpo }}
          />
          <motion.span
            className="block h-full origin-right bg-gradient-to-l from-amber to-amber/45"
            style={{ width: `calc(${right.weight}% - 0.5px)` }}
            variants={{ hidden: { scaleX: 0 }, visible: { scaleX: 1 } }}
            transition={{ duration: 1.3, ease: EASE.outExpo }}
          />
        </motion.div>

        <div className="mt-4 flex items-center justify-center gap-3">
          <span aria-hidden className="h-px w-10 bg-line" />
          <span className="label text-text-4">Neither position is retired</span>
          <span aria-hidden className="h-px w-10 bg-line" />
        </div>
      </Reveal>

      <StaggerGroup
        className="mt-10 grid gap-px bg-line sm:grid-cols-2"
        gap={0.1}
      >
        {ANSWER.conflict.positions.map((position) => {
          const blue = position.tone === 'blue';
          return (
            <StaggerItem
              key={position.stance}
              variants={riseInFlat}
              className={cn(
                'relative bg-void px-7 py-8 sm:px-8 sm:py-9',
                'before:absolute before:inset-x-0 before:top-0 before:h-px',
                blue ? 'before:bg-blue' : 'before:bg-amber',
              )}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-50"
                style={{
                  background: blue
                    ? 'radial-gradient(120% 70% at 50% 0%, rgba(61,107,255,0.15), transparent 68%)'
                    : 'radial-gradient(120% 70% at 50% 0%, rgba(255,184,107,0.12), transparent 68%)',
                }}
              />

              <div className="relative">
                <h3
                  className={cn(
                    'text-h3 font-sans font-medium',
                    blue ? 'text-blue-soft' : 'text-amber',
                  )}
                >
                  {position.stance}
                </h3>
                <p className="mt-4 max-w-[46ch] text-[0.9375rem] leading-relaxed text-text-2">
                  {position.body}
                </p>
                <div className="mt-7 flex items-center gap-3 border-t border-line pt-5">
                  <span
                    aria-hidden
                    className={cn(
                      'size-1 rounded-full',
                      blue ? 'bg-blue-soft' : 'bg-amber',
                    )}
                  />
                  <span className="tnum font-mono text-[0.625rem] tracking-[0.14em] text-text-3 uppercase">
                    {position.backing}
                  </span>
                </div>
              </div>
            </StaggerItem>
          );
        })}
      </StaggerGroup>
    </Layer>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   08 — RELATED
   ══════════════════════════════════════════════════════════════════════════ */

function RelatedLayer({ onAsk }: { onAsk: (title: string) => void }) {
  return (
    <Layer
      id="related"
      index={ANSWER.layers[7].index}
      label={ANSWER.layers[7].label}
      aside={<LayerCount>{ANSWER.related.length} adjacent claims</LayerCount>}
    >
      <StaggerGroup
        as="ul"
        gap={0.06}
        className="grid gap-px border-y border-line bg-line sm:grid-cols-2 xl:grid-cols-3"
      >
        {ANSWER.related.map((item) => (
          <StaggerItem key={item.title} as="li" variants={riseInFlat}>
            <button
              type="button"
              onClick={() => onAsk(item.title)}
              className={cn(
                'group flex h-full w-full items-start justify-between gap-6 bg-void px-6 py-7 text-left',
                'transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-surface-1',
              )}
            >
              <span className="min-w-0">
                <span className="block max-w-[26ch] text-[0.9375rem] leading-snug text-text-2 transition-colors duration-300 group-hover:text-text-1">
                  {item.title}
                </span>
                <span className="tnum mt-4 block font-mono text-[0.625rem] tracking-[0.16em] text-text-4 uppercase">
                  {item.confidence}% confidence
                </span>
              </span>

              <ArrowUpRight
                className={cn(
                  'mt-0.5 size-4 shrink-0 text-text-4 transition-all duration-500',
                  'ease-[cubic-bezier(0.16,1,0.3,1)]',
                  'group-hover:translate-x-1 group-hover:-translate-y-1 group-hover:text-blue-soft',
                )}
                strokeWidth={1.75}
                aria-hidden
              />
            </button>
          </StaggerItem>
        ))}
      </StaggerGroup>
    </Layer>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   FOLLOW-UP
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Fixed to the bottom edge below lg, inline at the end of the column above it.
 * One element repositioned rather than two rendered — so the field keeps a
 * single ref, and the related rows can always focus whichever form it wears.
 */
function FollowUpBar({
  inputRef,
  value,
  onChange,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (next: string) => void;
}) {
  const [ack, setAck] = useState(false);

  useEffect(() => {
    if (!ack) return;
    const id = window.setTimeout(() => setAck(false), 2800);
    return () => window.clearTimeout(id);
  }, [ack]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    pulseScene(1);
    onChange('');
    setAck(true);
    inputRef.current?.blur();
  };

  return (
    <div
      id="follow-up"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-line bg-void/85 px-5 pt-3 backdrop-blur-xl',
        'pb-[max(0.75rem,env(safe-area-inset-bottom))]',
        'lg:static lg:mt-20 lg:border-t-0 lg:bg-transparent lg:px-0 lg:pt-0 lg:pb-0 lg:backdrop-blur-none',
      )}
    >
      <div className="lg:border-t lg:border-line lg:pt-14">
        <div className="hidden lg:block">
          <InstrumentLabel>Ask a follow-up</InstrumentLabel>
          <p className="measure mt-5 text-sm text-text-3">
            A follow-up does not open a new page. It joins the same queue this
            answer came from, and re-scores the claims it touches.
          </p>
        </div>

        <form
          onSubmit={submit}
          role="search"
          className={cn(
            'glass-deep glass-specular relative flex items-center gap-3 rounded-full',
            'h-12 pr-1.5 pl-4 lg:mt-7 lg:h-14 lg:max-w-2xl lg:pr-2 lg:pl-5',
          )}
        >
          <span className="label hidden shrink-0 sm:block">Ask</span>
          <span
            aria-hidden
            className="hidden h-4 w-px shrink-0 bg-line-strong sm:block"
          />

          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Ask a follow-up about this answer"
            aria-label="Ask a follow-up about this answer"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-sm text-text-1 placeholder:text-text-3 lg:text-[0.9375rem]"
          />

          <motion.button
            type="submit"
            disabled={!value.trim()}
            aria-label="Send follow-up"
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-full lg:size-10',
              'bg-text-1 text-void transition-opacity duration-300',
              'shadow-[0_6px_20px_-6px_rgba(61,107,255,0.5)] disabled:opacity-30 disabled:shadow-none',
            )}
            whileTap={{ scale: 0.92 }}
            transition={SPRING_SNAP}
          >
            <ArrowUp className="size-4" strokeWidth={2} aria-hidden />
          </motion.button>
        </form>

        <div className="mt-1.5 min-h-[1.25rem] lg:mt-3 lg:min-h-[1.75rem]">
          <AnimatePresence>
            {ack && (
              <motion.p
                className="label flex items-center gap-2.5 text-cyan"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35, ease: EASE.outExpo }}
                role="status"
              >
                <PulseDot />
                Queued · this answer will be re-scored
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
