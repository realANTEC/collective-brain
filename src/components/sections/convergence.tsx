'use client';

import { useRef } from 'react';
import {
  motion,
  useMotionTemplate,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion';

import {
  ConfidenceMeter,
  GlassCard,
  GlassPanel,
  InstrumentLabel,
  Lead,
  SectionShell,
  StackedHeadline,
  StaggerGroup,
  StaggerItem,
  StatusPill,
} from '@/components/ui';
import { CONVERGENCE_SECTION } from '@/lib/content';
import {
  VIEWPORT,
  assembleIn,
  drawPath,
  pickVariants,
  stagger,
} from '@/lib/motion';
import { useMediaQuery, usePrefersReducedMotion } from '@/lib/hooks';
import { cn } from '@/lib/utils';

/* --------------------------------------------------------------------------
   Stage geometry.

   The five threads and the merged panel share one `relative` stage, but not one
   scroll progress: the stage range drives the cards toward the optical centre,
   and the panel — which begins a whole grid lower — is triggered off its own
   box so its arrival is something a reader is actually present for.

   `grid` places each card on the 12-column stage; `offset` is a margin class
   rather than a translate class because Framer owns `transform` on these
   elements and a Tailwind translate would be silently overwritten.

   `to` is where the card ends up at full convergence, expressed as a
   percentage of its own box so it stays correct at every viewport width.
   `anchor` is the card's exit point in stage-percentage space — the connector
   SVG below uses the same coordinate system, which is what keeps the lines
   attached to the cards without measuring anything at runtime.
   -------------------------------------------------------------------------- */

const STAGE = [
  {
    grid: 'lg:col-start-1 lg:col-span-4 lg:row-start-1',
    offset: 'lg:mt-2',
    to: { x: '26%', y: '34%', rotate: 2.5 },
    anchor: { x: 17, y: 31 },
  },
  {
    grid: 'lg:col-start-6 lg:col-span-4 lg:row-start-1',
    offset: 'lg:mt-20',
    to: { x: '-4%', y: '26%', rotate: -1.2 },
    anchor: { x: 58, y: 42 },
  },
  {
    grid: 'lg:col-start-10 lg:col-span-3 lg:row-start-1',
    offset: 'lg:mt-0',
    to: { x: '-38%', y: '38%', rotate: -3 },
    anchor: { x: 87, y: 33 },
  },
  {
    grid: 'lg:col-start-2 lg:col-span-4 lg:row-start-2',
    offset: 'lg:mt-10',
    to: { x: '34%', y: '12%', rotate: 1.6 },
    anchor: { x: 25, y: 80 },
  },
  {
    grid: 'lg:col-start-7 lg:col-span-4 lg:row-start-2',
    offset: 'lg:-mt-4',
    to: { x: '-22%', y: '6%', rotate: -2 },
    anchor: { x: 67, y: 71 },
  },
] as const;

/**
 * Where every thread ends up, in funnel-percentage space — the bottom-centre
 * of the funnel, which is exactly the merged panel's top edge. Anchors are
 * approximate by design: each connector's gradient starts fully transparent at
 * the card end, so a few pixels of drift at that end is invisible while the lit
 * end stays pinned to a coordinate that cannot move.
 */
const CONFLUENCE = { x: 50, y: 100 };

export function ConvergenceSection() {
  const reduced = usePrefersReducedMotion();
  // Matches Tailwind's `lg` — the breakpoint where the threads stop being a
  // list and become a scatter. Below it they are neither pulled toward a centre
  // they no longer surround, nor dressed as glass cards: see ThreadCard.
  const scattered = useMediaQuery('(min-width: 64rem)');
  const converging = scattered && !reduced;
  const stageRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Progress runs from "the stage has just entered the viewport" to "the stage
  // is centred". It drives the funnel only — the cards, the connectors and the
  // confluence node, all of which live in the stage's upper half.
  const { scrollYProgress } = useScroll({
    target: stageRef,
    offset: ['start end', 'center center'],
  });
  const progress = useSpring(scrollYProgress, {
    stiffness: 110,
    damping: 28,
    mass: 0.5,
  });

  // The panel cannot share the stage progress: it starts a whole grid plus the
  // throat below the stage top, so by the time its first pixel clears the fold
  // a stage-driven entrance has already finished playing to nobody. It gets its
  // own range, measured from its own box — 0 as its top edge touches the
  // viewport bottom, 1 once it has risen into frame.
  const { scrollYProgress: panelScroll } = useScroll({
    target: panelRef,
    offset: ['start end', 'start 55%'],
  });
  const panelProgress = useSpring(panelScroll, {
    stiffness: 110,
    damping: 28,
    mass: 0.5,
  });

  const panelOpacity = useTransform(panelProgress, [0, 0.55], [0, 1]);
  const panelY = useTransform(panelProgress, [0, 1], [64, 0]);
  const panelScale = useTransform(panelProgress, [0, 1], [0.968, 1]);
  const nodeScale = useTransform(progress, [0.5, 0.95], [0, 1]);
  const nodeOpacity = useTransform(progress, [0.5, 0.8, 1], [0, 1, 0.75]);

  const { threads, merged } = CONVERGENCE_SECTION;

  return (
    <SectionShell id="convergence" index={3} className="relative overflow-hidden">
      <div className="gutter">
        {/* Header — deliberately off-grid: the headline holds the left six
            columns, the lead hangs from column eight and drops half a line. */}
        <div className="grid gap-y-8 lg:grid-cols-12 lg:gap-x-8">
          <div className="lg:col-span-6">
            <InstrumentLabel index="04">
              {CONVERGENCE_SECTION.eyebrow}
            </InstrumentLabel>
            <StackedHeadline
              className="mt-7"
              text={CONVERGENCE_SECTION.headline}
              accent={CONVERGENCE_SECTION.headlineAccent}
            />
          </div>

          <div className="lg:col-start-8 lg:col-span-5 lg:pt-6">
            <Lead>{CONVERGENCE_SECTION.body}</Lead>
            <div className="mt-7 flex items-center gap-4">
              <span className="label tnum text-blue-soft/70">
                {String(threads.length).padStart(2, '0')} threads
              </span>
              <span aria-hidden className="h-px flex-1 bg-line" />
              <span className="label">1 answer</span>
            </div>
          </div>
        </div>

        {/* ── The merge ─────────────────────────────────────────────────── */}
        <div ref={stageRef} className="relative mt-20 lg:mt-32">
          {/* The funnel is its own box so the connector SVG has a coordinate
              space that ends exactly where the merged panel begins — the lines
              cannot terminate underneath a panel whose height they don't know. */}
          <div className="relative">
            <Connectors progress={progress} reduced={reduced} />

            {/* The confluence node is a DOM element rather than an SVG circle:
                the SVG is stretched by preserveAspectRatio="none", which would
                render a circle as an ellipse. Centring goes through Framer's
                x/y rather than a Tailwind translate, because Framer owns
                `transform` on this element and would drop the class. */}
            <motion.span
              aria-hidden
              className="absolute z-30 hidden size-2 rounded-full bg-cyan shadow-[0_0_22px_5px_rgba(110,231,245,0.5)] lg:block"
              style={{
                left: `${CONFLUENCE.x}%`,
                bottom: 0,
                x: '-50%',
                y: '50%',
                scale: reduced ? 1 : nodeScale,
                opacity: reduced ? 0.75 : nodeOpacity,
              }}
            />

            {/* Three densities, not one. Below `sm` the threads are a single
                hairline column; from `sm` they pair up so ~90 characters never
                have to span a 950px measure; at `lg` they break the grid and
                scatter. items-start is load-bearing at `lg`: under the default
                `stretch` the per-card margin offsets would shorten the cards
                instead of displacing them, and the scatter would collapse to a
                flush row. Row gap is zero below `lg` — the rows are separated
                by their own hairlines, not by air. */}
            <StaggerGroup
              className="relative z-10 grid items-start gap-x-8 gap-y-0 sm:grid-cols-2 lg:grid-cols-12 lg:gap-x-5 lg:gap-y-4"
              gap={0.08}
            >
              {threads.map((thread, i) => (
                <ThreadCard
                  key={thread.id}
                  index={i}
                  thread={thread}
                  progress={progress}
                  converging={converging}
                  scattered={scattered}
                />
              ))}
            </StaggerGroup>

            {/* The throat the connectors run through — and, below `lg`, the
                funnel itself, since the scattered connectors have no cards to
                attach to there. */}
            <div aria-hidden className="relative h-24 lg:h-32 xl:h-40">
              <CompactFunnel reduced={reduced} />
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 lg:hidden">
                <span className="animate-breathe block size-1.5 rounded-full bg-cyan shadow-[0_0_18px_4px_rgba(110,231,245,0.45)]" />
              </span>
            </div>
          </div>

          {/* ── The merged answer ────────────────────────────────────────── */}
          <motion.div
            ref={panelRef}
            className="relative z-20"
            style={{
              opacity: reduced ? 1 : panelOpacity,
              y: reduced ? 0 : panelY,
              scale: reduced ? 1 : panelScale,
            }}
          >
            <GlassPanel deep className="overflow-hidden rounded-xl">
              {/* Static hairline plus a travelling highlight riding on top of
                  it — the panel reads as a live surface, not a printed slab. */}
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-px bg-line-strong"
              />
              <span
                aria-hidden
                className="animate-shimmer absolute inset-x-0 top-0 h-px"
                style={{
                  background:
                    'linear-gradient(90deg, transparent 0%, var(--color-blue-soft) 42%, var(--color-cyan) 58%, transparent 100%)',
                  backgroundSize: '42% 100%',
                  backgroundRepeat: 'no-repeat',
                }}
              />

              <div className="grid gap-10 p-6 sm:p-9 lg:grid-cols-12 lg:gap-x-12 lg:p-14">
                <div className="lg:col-span-8">
                  <div className="flex items-center gap-4">
                    <span className="label text-blue-soft/75">
                      {merged.label}
                    </span>
                    <span aria-hidden className="h-px flex-1 bg-line" />
                    <StatusPill tone="merged" className="shrink-0">
                      merged
                    </StatusPill>
                  </div>

                  <p className="mt-7 text-h3 font-sans font-medium text-lume">
                    {merged.text}
                  </p>
                </div>

                <div className="flex flex-col justify-end gap-7 lg:col-span-4">
                  <ConfidenceMeter value={merged.confidence} />

                  <div className="grid grid-cols-2 border-t border-line pt-5">
                    <div>
                      <div className="tnum font-mono text-sm text-text-1">
                        {threads.length}
                      </div>
                      <div className="mt-1.5 text-xs text-text-3">
                        Threads merged
                      </div>
                    </div>
                    <div className="border-l border-line pl-5">
                      <div className="tnum font-mono text-sm text-text-1">
                        {new Set(threads.map((t) => t.region)).size}
                      </div>
                      <div className="mt-1.5 text-xs text-text-3">
                        Regions represented
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </GlassPanel>
          </motion.div>
        </div>
      </div>
    </SectionShell>
  );
}

/* -------------------------------------------------------------------------- */

function ThreadCard({
  index,
  thread,
  progress,
  converging,
  scattered,
}: {
  index: number;
  thread: (typeof CONVERGENCE_SECTION.threads)[number];
  progress: MotionValue<number>;
  converging: boolean;
  scattered: boolean;
}) {
  const cfg = STAGE[index];

  const x = useTransform(progress, [0, 1], ['0%', cfg.to.x]);
  const y = useTransform(progress, [0, 1], ['0%', cfg.to.y]);
  const rotate = useTransform(progress, [0, 1], [0, cfg.to.rotate]);
  const scale = useTransform(progress, [0, 1], [1, 0.84]);
  // Travel starts immediately, legibility does not end immediately. The entry
  // stagger lands ~1.3s after the group trips, which at a reading scroll is
  // already deep into this range — so the dissolve is held off until the
  // second half, and the blur until later still. The cards must be readable
  // before they are allowed to become texture.
  const opacity = useTransform(progress, [0, 0.55, 1], [1, 1, 0.16]);
  const blur = useTransform(progress, [0.6, 1], [0, 5]);
  const filter = useMotionTemplate`blur(${blur}px)`;

  /* One set of words, two shells. Scattered, each thread is a tilting glass
     card in the funnel. Stacked, glass on a full-width row is just a box, so
     the thread becomes a row in an instrument list: a mono index, a hairline
     above it, and no rounded container at all. */
  const body = (
    <div
      className={cn(
        'flex h-full flex-col',
        scattered ? 'p-5' : 'border-t border-line pt-4 pb-7',
      )}
    >
      <header className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-baseline gap-2.5">
          {!scattered && (
            <span className="label tnum shrink-0 text-blue-soft/70">
              {String(index + 1).padStart(2, '0')}
            </span>
          )}
          <span className="truncate text-xs font-medium text-text-2">
            {thread.author}
          </span>
        </span>
        <span className="label shrink-0">{thread.region}</span>
      </header>

      <p className="mt-4 text-sm text-text-1">{thread.question}</p>

      {/* Redundant in the list — the row hairlines already divide. */}
      {scattered && <div aria-hidden className="rule mt-5" />}

      <p className="mt-4 text-xs text-text-3">{thread.contribution}</p>
    </div>
  );

  // Convergence lives on the outer element and the entry reveal on the inner
  // one. Splitting them is what keeps the variant animation from seizing the
  // same `y` and `opacity` the scroll is driving.
  return (
    <motion.div
      className={cn('[perspective:1200px]', cfg.grid, cfg.offset)}
      style={converging ? { x, y, rotate, scale, opacity, filter } : undefined}
    >
      <StaggerItem variants={assembleIn}>
        {scattered ? <GlassCard tilt={4}>{body}</GlassCard> : body}
      </StaggerItem>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The converging connectors.
 *
 * viewBox is 0–100 on both axes with `preserveAspectRatio="none"`, so path
 * coordinates are literally percentages of the stage and stay attached to the
 * cards at any width. The stretch that implies would also stretch the stroke,
 * hence `vector-effect: non-scaling-stroke`.
 */
function Connectors({
  progress,
  reduced,
}: {
  progress: MotionValue<number>;
  reduced: boolean;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 z-0 hidden h-full w-full lg:block"
    >
      <defs>
        <linearGradient id="converge-line" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-blue-soft)" stopOpacity="0" />
          <stop offset="45%" stopColor="var(--color-blue-soft)" stopOpacity="0.34" />
          <stop offset="100%" stopColor="var(--color-cyan)" stopOpacity="0.7" />
        </linearGradient>
      </defs>

      {STAGE.map((cfg, i) => (
        <Connector key={i} anchor={cfg.anchor} progress={progress} reduced={reduced} />
      ))}
    </svg>
  );
}

/**
 * The same funnel, redrawn for a stacked layout.
 *
 * Below `lg` the threads are a list, so the scattered connectors have no cards
 * to hang from — but the convergence is the section, not a decoration on it.
 * Five lines leave the foot of the list and close on a single point at the top
 * edge of the merged answer. Driven by `whileInView` rather than the stage
 * progress because the throat is only a hundred pixels tall: a scroll-linked
 * draw would be over before it registered.
 */
const COMPACT_ANCHORS = [6, 28, 50, 72, 94] as const;

function CompactFunnel({ reduced }: { reduced: boolean }) {
  return (
    <motion.svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full lg:hidden"
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT}
      variants={stagger(0.09)}
    >
      <defs>
        <linearGradient id="converge-line-compact" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-blue-soft)" stopOpacity="0" />
          <stop
            offset="45%"
            stopColor="var(--color-blue-soft)"
            stopOpacity="0.3"
          />
          <stop offset="100%" stopColor="var(--color-cyan)" stopOpacity="0.68" />
        </linearGradient>
      </defs>

      {COMPACT_ANCHORS.map((x) => (
        <motion.path
          key={x}
          d={`M ${x} 0 C ${x} 58, 50 44, 50 100`}
          fill="none"
          stroke="url(#converge-line-compact)"
          strokeWidth={1}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          variants={pickVariants(reduced, drawPath)}
        />
      ))}
    </motion.svg>
  );
}

function Connector({
  anchor,
  progress,
  reduced,
}: {
  anchor: { x: number; y: number };
  progress: MotionValue<number>;
  reduced: boolean;
}) {
  const pathLength = useTransform(progress, [0.06, 0.78], [0, 1]);

  // Control points hold the line vertical as it leaves the card, then sweep it
  // into the confluence — a straight line between the two points would read as
  // a diagram, a funnel reads as flow.
  const midY = anchor.y + (CONFLUENCE.y - anchor.y) * 0.62;
  const d = `M ${anchor.x} ${anchor.y} C ${anchor.x} ${midY}, ${CONFLUENCE.x} ${midY}, ${CONFLUENCE.x} ${CONFLUENCE.y}`;

  return (
    <motion.path
      d={d}
      fill="none"
      stroke="url(#converge-line)"
      strokeWidth={1}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
      style={reduced ? undefined : { pathLength }}
    />
  );
}
