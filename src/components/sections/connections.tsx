'use client';

import { motion, type Variants } from 'framer-motion';

import {
  InstrumentLabel,
  Lead,
  Reveal,
  Rule,
  SectionShell,
  StackedHeadline,
  StaggerGroup,
  StaggerItem,
  Stat,
} from '@/components/ui';
import { CONNECTIONS_SECTION } from '@/lib/content';
import {
  EASE,
  VIEWPORT,
  drawPath,
  fadeIn,
  pickVariants,
  riseInFlat,
  stagger,
} from '@/lib/motion';
import { useIsMobile, usePrefersReducedMotion } from '@/lib/hooks';
import { cn } from '@/lib/utils';

/* ══════════════════════════════════════════════════════════════════════════
   CONSTELLATION GEOMETRY
   ──────────────────────────────────────────────────────────────────────────
   Every coordinate is a literal. A generated layout — even a seeded one —
   invites someone to reach for Math.random later, and a graph that differs
   between the server render and hydration is a guaranteed mismatch.
   ══════════════════════════════════════════════════════════════════════════ */

const VIEW = { w: 560, h: 420 };

interface ConstellationNode {
  x: number;
  y: number;
  r: number;
  /** Hubs get a second, expanding ring — the graph needs somewhere to look. */
  hub?: boolean;
}

const NODES: readonly ConstellationNode[] = [
  { x: 58, y: 92, r: 2.2 },
  { x: 126, y: 44, r: 1.7 },
  { x: 116, y: 168, r: 2.6 },
  { x: 46, y: 238, r: 1.7 },
  { x: 104, y: 302, r: 2.2 },
  { x: 174, y: 358, r: 1.7 },
  { x: 196, y: 116, r: 2.2 },
  { x: 150, y: 240, r: 2.6 },
  { x: 236, y: 210, r: 3.4, hub: true },
  { x: 262, y: 60, r: 2.2 },
  { x: 302, y: 148, r: 3.4, hub: true },
  { x: 288, y: 298, r: 2.6 },
  { x: 234, y: 380, r: 1.7 },
  { x: 356, y: 94, r: 2.2 },
  { x: 346, y: 232, r: 3.4, hub: true },
  { x: 318, y: 348, r: 1.7 },
  { x: 404, y: 302, r: 2.2 },
  { x: 434, y: 168, r: 2.6 },
  { x: 398, y: 42, r: 1.7 },
  { x: 470, y: 246, r: 2.2 },
  { x: 508, y: 120, r: 1.7 },
  { x: 492, y: 350, r: 2.2 },
];

/** Directed only so the packet routes below can chain segments end to end. */
const EDGE_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [0, 2], [2, 3], [3, 4], [4, 5], [5, 12], [11, 12],
  [2, 7], [4, 7], [7, 8], [6, 8], [1, 6], [6, 9], [9, 10],
  [8, 10], [8, 11], [8, 14], [10, 13], [10, 14], [11, 15],
  [14, 11], [13, 18], [9, 13], [13, 17], [14, 17], [14, 16],
  [15, 16], [16, 19], [17, 19], [17, 20], [19, 21], [16, 21],
];

const EDGES = EDGE_PAIRS.map(([a, b], i) => {
  const p = NODES[a];
  const q = NODES[b];
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const len = Math.hypot(dx, dy) || 1;

  // Bow each edge perpendicular to its own chord: sign alternates with the
  // index, magnitude scales with length. Short links stay taut, long spans
  // arc — a graph of straight lines reads as a diagram, a graph of arcs
  // reads as a structure.
  const bow = (i % 2 === 0 ? 1 : -1) * len * 0.1;
  const cx = ((p.x + q.x) / 2 - (dy / len) * bow).toFixed(1);
  const cy = ((p.y + q.y) / 2 + (dx / len) * bow).toFixed(1);

  return {
    id: `cx-e${i}`,
    a,
    b,
    pair: `${a}-${b}`,
    d: `M${p.x} ${p.y}Q${cx} ${cy} ${q.x} ${q.y}`,
    width: i % 5 === 0 ? 1.15 : i % 3 === 0 ? 0.85 : 0.6,
    opacity: i % 4 === 0 ? 0.6 : i % 3 === 0 ? 0.42 : 0.26,
  };
});

const EDGE_BY_PAIR = new Map(EDGES.map((e) => [e.pair, e.d]));

/**
 * Stitch a node sequence into one unbroken path by reusing the exact curve
 * segments already drawn as edges — so a travelling packet rides the visible
 * wire rather than a parallel invisible one.
 */
function routeFrom(sequence: readonly number[]) {
  return sequence
    .slice(1)
    .map((to, i) => {
      const d = EDGE_BY_PAIR.get(`${sequence[i]}-${to}`);
      if (!d) return '';
      // Only the first segment keeps its moveto; the rest append as curves.
      return i === 0 ? d : d.slice(d.indexOf('Q'));
    })
    .join('');
}

const ROUTES = [
  { id: 'cx-route-a', d: routeFrom([0, 2, 7, 8, 10, 14, 17, 20]), dur: '9.5s', begin: '0s' },
  { id: 'cx-route-b', d: routeFrom([4, 7, 8, 11, 15, 16, 19]), dur: '7.2s', begin: '2.1s' },
  { id: 'cx-route-c', d: routeFrom([1, 6, 9, 10, 13, 18]), dur: '11.5s', begin: '4.3s' },
];

/* ══════════════════════════════════════════════════════════════════════════
   FRAMING — the phone gets a different graph, not a smaller one
   ──────────────────────────────────────────────────────────────────────────
   At a 375px viewport the gutter leaves ~335 CSS px, so the full 560×420 board
   renders at 0.6×: a 0.6-unit stroke lands on a third of a pixel, a 1.7-unit
   node on a single one, and the section's entire visual argument dissolves
   into a smudge. So mobile crops instead of scaling — a square window onto the
   densest part of the graph, with fewer marks drawn heavier. Edges that run
   off the crop are kept: a graph that stops at the frame reads as a diagram,
   one that runs past it reads as a fragment of something larger.
   ══════════════════════════════════════════════════════════════════════════ */

const MOBILE_BOX = { x: 110, y: 40, w: 340, h: 340 };

const INDEXED_NODES = NODES.map((node, i) => ({ node, i }));

const MOBILE_NODES = INDEXED_NODES.filter(
  ({ node }) =>
    node.x >= MOBILE_BOX.x - 14 &&
    node.x <= MOBILE_BOX.x + MOBILE_BOX.w + 14 &&
    node.y >= MOBILE_BOX.y - 14 &&
    node.y <= MOBILE_BOX.y + MOBILE_BOX.h + 14,
);

const MOBILE_NODE_INDICES = new Set(MOBILE_NODES.map(({ i }) => i));

/** Any edge with one foot inside the crop still draws; the rest are dropped
 *  rather than left to animate their path length outside the viewBox. */
const MOBILE_EDGES = EDGES.filter(
  (e) => MOBILE_NODE_INDICES.has(e.a) || MOBILE_NODE_INDICES.has(e.b),
);

/** Routes re-cut from in-frame nodes so no packet spends its run off screen. */
const MOBILE_ROUTES = [
  { id: 'cx-mroute-a', d: routeFrom([2, 7, 8, 10, 14, 17]), dur: '8.4s', begin: '0s' },
  { id: 'cx-mroute-b', d: routeFrom([1, 6, 8, 11, 15, 16]), dur: '6.6s', begin: '1.8s' },
  { id: 'cx-mroute-c', d: routeFrom([6, 9, 10, 13, 18]), dur: '9.8s', begin: '3.7s' },
];

interface Frame {
  box: { x: number; y: number; w: number; h: number };
  glow: { cx: number; cy: number; rx: number; ry: number };
  nodes: typeof INDEXED_NODES;
  edges: typeof EDGES;
  routes: typeof ROUTES;
  /** Mark multipliers that keep strokes and dots above the visibility floor
   *  once the crop has changed how many user units map to one CSS pixel. */
  nodeScale: number;
  strokeScale: number;
  opacityLift: number;
  packet: { r: number; halo: number; glow: number };
}

const DESKTOP_FRAME: Frame = {
  box: { x: 0, y: 0, w: VIEW.w, h: VIEW.h },
  glow: { cx: VIEW.w / 2, cy: 205, rx: 268, ry: 204 },
  nodes: INDEXED_NODES,
  edges: EDGES,
  routes: ROUTES,
  nodeScale: 1,
  strokeScale: 1,
  opacityLift: 0,
  packet: { r: 2.3, halo: 7, glow: 5 },
};

const MOBILE_FRAME: Frame = {
  box: MOBILE_BOX,
  glow: {
    cx: MOBILE_BOX.x + MOBILE_BOX.w / 2,
    cy: MOBILE_BOX.y + MOBILE_BOX.h / 2,
    rx: 196,
    ry: 190,
  },
  nodes: MOBILE_NODES,
  edges: MOBILE_EDGES,
  routes: MOBILE_ROUTES,
  nodeScale: 1.5,
  strokeScale: 1.8,
  opacityLift: 0.14,
  packet: { r: 3.4, halo: 10, glow: 7 },
};

const LEGEND = [
  { label: 'Claim', mark: 'size-1.5 rounded-full bg-blue-soft' },
  { label: 'Sourced edge', mark: 'h-px w-4 bg-violet-soft/70' },
  {
    label: 'Traversal',
    mark: 'size-1.5 rounded-full bg-cyan shadow-[0_0_8px_rgba(110,231,245,0.9)]',
  },
];

/**
 * The legend trails the graph rather than arriving with it.
 *
 * `Reveal`'s `delay` prop cannot express that: framer-motion resolves a
 * variant's own `transition` in preference to the component-level `transition`
 * prop, so any variant carrying its own timing — which every variant in the
 * house vocabulary does — silently swallows the delay. The offset has to live
 * inside the variant to survive.
 */
const legendIn: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { delay: 0.25, duration: 0.7, ease: EASE.outExpo },
  },
};

/* ══════════════════════════════════════════════════════════════════════════
   SECTION
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Section 03 — Connections.
 *
 * The headline sits right where section 02's sat left, so the page keeps
 * changing its mind about where to look. The constellation takes the vacated
 * side and carries the whole section's weight.
 */
export function ConnectionsSection() {
  const reduced = usePrefersReducedMotion();

  return (
    <SectionShell id="connections" index={2}>
      <div className="gutter grid grid-cols-12 items-center gap-y-16 lg:gap-x-10">
        {/* Constellation. Second in the source order on mobile so the
            typographic hierarchy still leads. */}
        <div className="order-2 col-span-12 lg:order-1 lg:col-span-6 lg:row-start-1">
          <div className="max-w-[640px]">
            <Constellation reduced={reduced} />

            <Reveal
              variants={legendIn}
              className="mt-8 border-t border-line pt-5"
            >
              <ul className="flex flex-wrap items-center gap-x-7 gap-y-3">
                {LEGEND.map((item) => (
                  <li key={item.label} className="flex items-center gap-2.5">
                    <span aria-hidden className={item.mark} />
                    <span className="label">{item.label}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>

        {/* Headline block, offset right. */}
        <div className="order-1 col-span-12 sm:col-span-10 lg:order-2 lg:col-start-8 lg:col-span-5 lg:row-start-1">
          <InstrumentLabel index="03">
            {CONNECTIONS_SECTION.eyebrow}
          </InstrumentLabel>

          <StackedHeadline
            text={CONNECTIONS_SECTION.headline}
            accent={CONNECTIONS_SECTION.headlineAccent}
            size="h2"
            className="mt-8"
          />

          <Lead className="mt-7">{CONNECTIONS_SECTION.body}</Lead>
        </div>
      </div>

      {/* Instrument readout across the full page width. */}
      <div className="gutter mt-24 lg:mt-32">
        <Rule />

        {/* Orchestrated, not per-item: the cells must land one after another,
            and a `delay` prop on each would be discarded by riseInFlat's own
            transition. StaggerGroup puts the offset where the variant system
            actually reads it. */}
        <StaggerGroup gap={0.1} className="grid grid-cols-1 sm:grid-cols-3">
          {CONNECTIONS_SECTION.stats.map((stat, i) => (
            <StaggerItem
              key={stat.label}
              variants={riseInFlat}
              className={cn(
                'relative py-9 sm:py-11',
                i > 0 && 'border-t border-line sm:border-t-0 sm:pl-10',
              )}
            >
              {i > 0 && (
                <span
                  aria-hidden
                  className="rule-v absolute inset-y-5 left-0 hidden sm:block"
                />
              )}

              <span className="label tnum text-blue-soft/70">
                {`0${i + 1}`}
              </span>

              <Stat
                className="mt-5"
                value={stat.value}
                suffix={stat.suffix}
                label={stat.label}
                decimals={stat.decimals}
              />
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </SectionShell>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   CONSTELLATION
   ══════════════════════════════════════════════════════════════════════════ */

function Constellation({ reduced }: { reduced: boolean }) {
  const frame = useIsMobile() ? MOBILE_FRAME : DESKTOP_FRAME;
  const { box, glow, packet } = frame;

  return (
    <svg
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      className="h-auto w-full"
      role="img"
      aria-label="A constellation of knowledge claims joined by sourced edges, with signals travelling along the paths between them."
    >
      <defs>
        <radialGradient id="cx-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--color-blue)" stopOpacity="0.3" />
          <stop offset="46%" stopColor="var(--color-violet)" stopOpacity="0.1" />
          <stop offset="100%" stopColor="var(--color-violet)" stopOpacity="0" />
        </radialGradient>

        {/* One gradient shared by every wire, mapped in user space, so the
            linework carries a single light direction across the whole graph
            instead of each edge fading on its own axis. Anchored to the frame
            rather than to VIEW so the cropped mobile window still gets the
            full sweep instead of a slice out of the middle of it. */}
        <linearGradient
          id="cx-wire"
          gradientUnits="userSpaceOnUse"
          x1={box.x}
          y1={box.y + box.h}
          x2={box.x + box.w}
          y2={box.y}
        >
          <stop offset="0%" stopColor="var(--color-blue)" />
          <stop offset="52%" stopColor="var(--color-violet-soft)" />
          <stop offset="100%" stopColor="var(--color-cyan)" />
        </linearGradient>

        <radialGradient id="cx-hub" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--color-text-1)" />
          <stop offset="100%" stopColor="var(--color-blue-soft)" />
        </radialGradient>

        {frame.routes.map((route) => (
          <path key={route.id} id={route.id} d={route.d} fill="none" />
        ))}
      </defs>

      <ellipse
        cx={glow.cx}
        cy={glow.cy}
        rx={glow.rx}
        ry={glow.ry}
        fill="url(#cx-glow)"
      />

      <motion.g
        fill="none"
        stroke="url(#cx-wire)"
        strokeLinecap="round"
        initial="hidden"
        whileInView="visible"
        viewport={VIEWPORT}
        variants={stagger(0.035, 0.1)}
      >
        {frame.edges.map((edge) => (
          <motion.path
            key={edge.id}
            d={edge.d}
            strokeWidth={edge.width * frame.strokeScale}
            strokeOpacity={Math.min(0.72, edge.opacity + frame.opacityLift)}
            variants={pickVariants(reduced, drawPath)}
          />
        ))}
      </motion.g>

      <motion.g
        initial="hidden"
        whileInView="visible"
        viewport={VIEWPORT}
        variants={stagger(0.03, 0.5)}
      >
        {frame.nodes.map(({ node, i }) => (
          <motion.g key={i} variants={pickVariants(reduced, fadeIn)}>
            {node.hub && !reduced && (
              <circle
                cx={node.x}
                cy={node.y}
                r={node.r * 2.4 * frame.nodeScale}
                fill="none"
                stroke="var(--color-blue-soft)"
                strokeWidth={0.6 * frame.strokeScale}
                opacity={0.55}
                // transform-box:fill-box is what makes the keyframe scale about
                // the circle's own centre; without it an SVG transform pivots
                // on the viewBox origin and the ring flies off to the corner.
                className="animate-pulse-ring origin-center [transform-box:fill-box]"
                style={{ animationDelay: `${(i * 0.43).toFixed(2)}s` }}
              />
            )}

            <circle
              cx={node.x}
              cy={node.y}
              r={node.r * 3 * frame.nodeScale}
              fill="var(--color-blue)"
              opacity={node.hub ? 0.18 : 0.09}
            />

            <circle
              cx={node.x}
              cy={node.y}
              r={node.r * frame.nodeScale}
              fill={node.hub ? 'url(#cx-hub)' : 'var(--color-blue-soft)'}
              className={
                reduced
                  ? undefined
                  : 'animate-breathe origin-center [transform-box:fill-box]'
              }
              style={
                reduced
                  ? undefined
                  : { animationDelay: `${((i * 0.31) % 4.5).toFixed(2)}s` }
              }
            />
          </motion.g>
        ))}
      </motion.g>

      {/* Travelling packets. SMIL rather than JS: animateMotion follows the
          curve's own arc-length parameterisation, which no rAF loop gets for
          free, and it costs nothing on the main thread. */}
      {!reduced && (
        <motion.g
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={VIEWPORT}
          transition={{ duration: 1, delay: 1.5 }}
        >
          {frame.routes.map((route) => (
            <g key={`${route.id}-packet`}>
              <circle r={packet.halo} fill="var(--color-cyan)" opacity={0.12} />
              <circle
                r={packet.r}
                fill="var(--color-cyan)"
                style={{
                  filter: `drop-shadow(0 0 ${packet.glow}px var(--color-cyan))`,
                }}
              />
              <animateMotion
                dur={route.dur}
                begin={route.begin}
                repeatCount="indefinite"
              >
                <mpath href={`#${route.id}`} />
              </animateMotion>
            </g>
          ))}
        </motion.g>
      )}
    </svg>
  );
}
