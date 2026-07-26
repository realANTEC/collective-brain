'use client';

import type { CSSProperties, ReactElement } from 'react';

import {
  GlassCard,
  InstrumentLabel,
  Lead,
  SectionShell,
  StackedHeadline,
  StaggerGroup,
  StaggerItem,
} from '@/components/ui';
import { FEATURES, MEMORY_SECTION } from '@/lib/content';
import { riseInFlat } from '@/lib/motion';
import { usePrefersReducedMotion } from '@/lib/hooks';
import { cn } from '@/lib/utils';

/**
 * Memory.
 *
 * Two blocks at deliberately different densities. The pipeline is an
 * instrument: six hairline-separated columns with a light packet running the
 * rail between them. The feature bento is the opposite — few, large, tactile
 * surfaces. Putting a dense rule-based grid directly above a sparse glass
 * bento is what stops the page reading as a template. Inside the bento the
 * same rule applies at a smaller scale: the double-height anchor carries a
 * different weight of content, not the same card with more air in it.
 */
export function MemorySection() {
  return (
    <SectionShell id="memory" index={5} className="isolate">
      {/* The single soft glow of the section. It sits above the rail, over the
          headline mass only — light behind small type raises the background
          luminance exactly where legibility is already worst. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-[-4%] left-1/2 -z-10 h-[32rem] w-[54rem] max-w-[120vw] -translate-x-1/2"
        style={{
          background:
            'radial-gradient(closest-side, color-mix(in oklab, var(--color-blue) 12%, transparent), transparent)',
        }}
      />

      {/* ── Block A — the pipeline ─────────────────────────────────────── */}
      <div className="gutter">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-6">
            <InstrumentLabel index="06">{MEMORY_SECTION.eyebrow}</InstrumentLabel>
            <StackedHeadline
              className="mt-8"
              text={MEMORY_SECTION.headline}
              accent={MEMORY_SECTION.headlineAccent}
            />
          </div>

          <div className="lg:col-span-4 lg:col-start-9 lg:self-end lg:pb-3">
            <Lead>{MEMORY_SECTION.body}</Lead>
          </div>
        </div>

        <ProcessRail />
      </div>

      {/* ── Block B — the instrument bento ─────────────────────────────── */}
      <div className="gutter mt-28 lg:mt-44">
        <div className="mb-9 flex items-baseline justify-between gap-6 border-t border-line pt-6 lg:mb-14">
          <span className="label">Instruments</span>
          <span className="label tnum text-text-4">
            {String(FEATURES.length).padStart(2, '0')} available
          </span>
        </div>

        <StaggerGroup
          gap={0.07}
          className={cn(
            'grid gap-3 sm:gap-4',
            'md:grid-cols-2',
            'lg:auto-rows-[minmax(13.5rem,auto)] lg:grid-cols-6',
          )}
        >
          {FEATURES.map((feature) => {
            const Glyph = GLYPHS[feature.id];
            const anchor = feature.id === ANCHOR_ID;

            return (
              <StaggerItem
                key={feature.id}
                variants={riseInFlat}
                className={BENTO_SPAN[feature.id]}
              >
                <GlassCard
                  as="article"
                  tilt={anchor ? 3 : 4}
                  className="h-full"
                  innerClassName="flex h-full flex-col p-6 sm:p-7 lg:p-8"
                >
                  <div className="flex items-start justify-between gap-6">
                    <span className="label tnum text-blue-soft/70">
                      {feature.index}
                    </span>
                    <Glyph className={anchor ? 'h-14 w-28' : undefined} />
                  </div>

                  {/* The anchor is twice the height of its neighbours, so it
                      gets twice the content rather than twice the empty space:
                      a telemetry strip fills the band the row-span opens up,
                      and the name steps up a size to match the area. */}
                  {anchor && (
                    <dl className="mt-7 grid grid-cols-3 gap-x-4 border-t border-line pt-5 lg:mt-9">
                      {ANCHOR_READOUT.map((cell) => (
                        <div key={cell.label}>
                          <dt className="label text-text-4">{cell.label}</dt>
                          <dd className="tnum mt-2.5 font-mono text-sm text-text-1">
                            {cell.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}

                  <div
                    className={cn(
                      'mt-12 lg:mt-auto',
                      anchor ? 'lg:pt-8' : 'lg:pt-14',
                    )}
                  >
                    <h3
                      className={cn(
                        'text-h3 font-sans font-medium text-text-1',
                        anchor && 'lg:text-h2',
                      )}
                    >
                      {feature.name}
                    </h3>
                    <p
                      className={cn(
                        'mt-3 text-body text-blue-soft',
                        anchor && 'lg:text-lead',
                      )}
                    >
                      {feature.blurb}
                    </p>
                    <p className="mt-4 max-w-[46ch] text-sm text-text-2">
                      {feature.body}
                    </p>
                  </div>
                </GlassCard>
              </StaggerItem>
            );
          })}
        </StaggerGroup>
      </div>
    </SectionShell>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   THE PROCESS RAIL
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The travelling packet is a fixed-percentage sliver translated by a multiple
 * of its own width: a span of width W% clears the rail exactly when it moves
 * from -100% to (100/W - 1) * 100%. At W = 20 that is 400%, plus one more
 * width to exit cleanly — 500%. Doing it in `transform` rather than `left`
 * keeps the whole loop on the compositor.
 */
const PACKET_KEYFRAMES = `
@keyframes cb-packet-x {
  0%   { transform: translateX(-100%); opacity: 0; }
  12%  { opacity: 1; }
  88%  { opacity: 1; }
  100% { transform: translateX(500%); opacity: 0; }
}
@keyframes cb-packet-y {
  0%   { transform: translateY(-100%); opacity: 0; }
  12%  { opacity: 1; }
  88%  { opacity: 1; }
  100% { transform: translateY(500%); opacity: 0; }
}`;

const PACKET_TIMING = '6.5s cubic-bezier(0.83, 0, 0.17, 1) infinite';

function ProcessRail() {
  const reduced = usePrefersReducedMotion();

  return (
    <div className="relative mt-16 lg:mt-28">
      {!reduced && (
        <style dangerouslySetInnerHTML={{ __html: PACKET_KEYFRAMES }} />
      )}

      <Scrim />

      {/* Horizontal rail — lg and up */}
      <div className="relative hidden lg:block">
        <div className="relative h-px w-full bg-line">
          {!reduced && (
            <span
              aria-hidden
              className="pointer-events-none absolute top-0 left-0 h-px w-[20%]"
              style={{ animation: `cb-packet-x ${PACKET_TIMING}` }}
            >
              <span
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(90deg, transparent, var(--color-cyan), transparent)',
                }}
              />
              <span
                className="absolute inset-x-[24%] -top-[7px] h-[15px] opacity-45 blur-[7px]"
                style={{
                  background:
                    'radial-gradient(closest-side, var(--color-cyan), transparent)',
                }}
              />
            </span>
          )}
        </div>

        <StaggerGroup as="ul" gap={0.08} className="grid grid-cols-6">
          {MEMORY_SECTION.pipeline.map((step, i) => (
            <StaggerItem
              as="li"
              key={step.index}
              className={cn(
                'group relative pt-9 pr-7',
                i > 0 && 'border-l border-line pl-7',
              )}
            >
              <Node className="absolute top-0 left-0" />
              <span className="label tnum text-blue-soft/70">{step.index}</span>
              <h3 className="mt-5 text-lead font-medium text-text-1">
                {step.title}
              </h3>
              <p className="mt-3 text-sm text-text-2">{step.body}</p>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>

      {/* Vertical rail — below lg */}
      <div className="relative lg:hidden">
        <div className="absolute inset-y-0 left-0 w-px bg-line">
          {!reduced && (
            <span
              aria-hidden
              className="pointer-events-none absolute top-0 left-0 h-[20%] w-px"
              style={{ animation: `cb-packet-y ${PACKET_TIMING}` }}
            >
              <span
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(180deg, transparent, var(--color-cyan), transparent)',
                }}
              />
              <span
                className="absolute inset-y-[24%] -left-[7px] w-[15px] opacity-45 blur-[7px]"
                style={{
                  background:
                    'radial-gradient(closest-side, var(--color-cyan), transparent)',
                }}
              />
            </span>
          )}
        </div>

        <StaggerGroup as="ul" gap={0.06}>
          {MEMORY_SECTION.pipeline.map((step, i) => (
            <StaggerItem
              as="li"
              key={step.index}
              className={cn(
                'group relative py-7 pl-7',
                i < MEMORY_SECTION.pipeline.length - 1 && 'border-b border-line',
              )}
            >
              <Node className="absolute top-[2.1rem] left-0" />
              <span className="label tnum text-blue-soft/70">{step.index}</span>
              <h3 className="mt-4 text-lead font-medium text-text-1">
                {step.title}
              </h3>
              <p className="mt-2.5 max-w-[52ch] text-sm text-text-2">
                {step.body}
              </p>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </div>
  );
}

/**
 * A soft scrim that darkens the void behind the rail.
 *
 * Keyframe 06 runs the WebGL core at 0.82 opacity with almost the whole
 * connection network drawn, and the Atmosphere only vignettes the top and
 * bottom of the viewport — so mid-screen a moving point cloud sits directly
 * under six columns of `text-sm`. Same remedy as the graph section: pull the
 * background back down to near-void under the copy, and let it fall off before
 * it reaches anything else.
 *
 * Two shapes, because the rail has two shapes. The horizontal rail is wide and
 * short, so the ellipse fits it. Stacked, the rail is a column taller than the
 * viewport — a radial there would only protect whatever happened to sit near
 * its centre, so that one gets an even vertical wash masked at the sides.
 */
function Scrim() {
  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-x-8 -inset-y-10 hidden lg:block"
        style={{
          background:
            'radial-gradient(80% 70% at 50% 50%, rgb(5 5 8 / 0.88), rgb(5 5 8 / 0.45) 55%, transparent 78%)',
        }}
      />
      <span
        aria-hidden
        className="mask-fade-x pointer-events-none absolute -inset-x-8 -inset-y-10 lg:hidden"
        style={{
          background:
            'linear-gradient(to bottom, transparent, rgb(5 5 8 / 0.82) 7%, rgb(5 5 8 / 0.82) 93%, transparent)',
        }}
      />
    </>
  );
}

/** The diamond that sits exactly on the rail/divider intersection. */
function Node({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'size-[6px] -translate-x-1/2 -translate-y-1/2 rotate-45',
        'bg-blue-soft/70 transition-colors duration-500 group-hover:bg-cyan',
        className,
      )}
    />
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MICRO-VISUALS
   One per feature, each a literal picture of the concept it labels.
   ══════════════════════════════════════════════════════════════════════════ */

/* An SVG shape's transform-origin resolves against the viewBox, not the shape,
   so a bare `scale` on a <circle> pivots off in the corner. */
const FILL_BOX: CSSProperties = {
  transformBox: 'fill-box',
  transformOrigin: 'center',
};

/* Every glyph takes its own footprint so the anchor card can run the same
   drawing at a different scale. The viewBox is 2:1 throughout: at `size-14` it
   letterboxes, at `h-14 w-28` it fills. */
type GlyphProps = { className?: string };

/** Knowledge Timeline — a confidence trace that ends on the current reading. */
function SparklineGlyph({ className = 'size-14' }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 56 28"
      className={cn('shrink-0', className)}
      fill="none"
      aria-hidden
    >
      <polyline
        points="2,23 12,18 22,21 32,11 42,14 51,4"
        stroke="var(--color-blue-soft)"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="opacity-55 transition-opacity duration-700 group-hover/card:opacity-100"
      />
      <circle
        cx="51"
        cy="4"
        r="2.2"
        fill="var(--color-cyan)"
        style={FILL_BOX}
        className="transition-transform duration-700 ease-out-expo group-hover/card:scale-150"
      />
    </svg>
  );
}

/** Living Citations — rings that stay interlocked as they pull apart. */
function LinkedRingsGlyph({ className = 'size-14' }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 56 28"
      className={cn('shrink-0', className)}
      fill="none"
      aria-hidden
    >
      <circle
        cx="15"
        cy="14"
        r="9"
        stroke="var(--color-blue-soft)"
        strokeWidth="1.1"
        className="opacity-45 transition-transform duration-700 ease-out-expo group-hover/card:-translate-x-[3px]"
      />
      <circle
        cx="28"
        cy="14"
        r="9"
        stroke="var(--color-violet-soft)"
        strokeWidth="1.1"
        className="opacity-75 transition-opacity duration-700 group-hover/card:opacity-100"
      />
      <circle
        cx="41"
        cy="14"
        r="9"
        stroke="var(--color-cyan)"
        strokeWidth="1.1"
        className="opacity-45 transition-transform duration-700 ease-out-expo group-hover/card:translate-x-[3px]"
      />
    </svg>
  );
}

/** Community Corrections — five of six reviewers agree. */
const CONSENSUS = [true, true, true, true, false, true];

function ConsensusPipsGlyph({ className = 'w-14' }: GlyphProps) {
  return (
    <div
      className={cn('flex shrink-0 items-center gap-1 pt-1.5', className)}
      aria-hidden
    >
      {CONSENSUS.map((agrees, i) => (
        <span
          key={i}
          className={cn(
            'size-[6px] rounded-full transition-transform duration-500',
            'ease-out-expo group-hover/card:scale-150',
            agrees ? 'bg-cyan/85' : 'border border-line-strong',
          )}
          style={{ transitionDelay: `${i * 55}ms` }}
        />
      ))}
    </div>
  );
}

/** Knowledge DNA — two strands with the rungs that bind them. */
function HelixGlyph({ className = 'size-14' }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 56 28"
      className={cn('shrink-0', className)}
      fill="none"
      aria-hidden
    >
      <path
        d="M3 14C9 3 18 25 28 14S47 3 53 14"
        stroke="var(--color-blue-soft)"
        strokeWidth="1.1"
        strokeLinecap="round"
        className="opacity-70"
      />
      <path
        d="M3 14C9 25 18 3 28 14S47 25 53 14"
        stroke="var(--color-violet-soft)"
        strokeWidth="1.1"
        strokeLinecap="round"
        className="opacity-70"
      />
      {[11, 21, 35, 45].map((x, i) => (
        <line
          key={x}
          x1={x}
          y1={9}
          x2={x}
          y2={19}
          stroke="var(--color-cyan)"
          strokeWidth="1"
          className="opacity-20 transition-opacity duration-500 group-hover/card:opacity-90"
          style={{ transitionDelay: `${i * 75}ms` }}
        />
      ))}
    </svg>
  );
}

/** Memory Heatmap — load-bearing cells read hotter. */
const HEAT = [12, 34, 58, 22, 9, 40, 82, 46, 16, 30, 11, 44, 24, 66, 15];

function HeatGridGlyph({ className = 'w-14' }: GlyphProps) {
  return (
    <div
      aria-hidden
      className={cn(
        'grid shrink-0 grid-cols-5 gap-[3px] opacity-80 transition-opacity duration-700 group-hover/card:opacity-100',
        className,
      )}
    >
      {HEAT.map((v, i) => (
        <span
          key={i}
          className={cn(
            'aspect-square rounded-[1px] transition-transform duration-500',
            'ease-out-expo group-hover/card:scale-75',
            v >= 58 ? 'bg-cyan' : 'bg-blue-soft',
          )}
          style={{
            opacity: v / 100,
            // Diagonal sweep: column offset plus a smaller row offset.
            transitionDelay: `${(i % 5) * 55 + Math.floor(i / 5) * 35}ms`,
          }}
        />
      ))}
    </div>
  );
}

/** AI Reasoning Map — a branch that reconverges on one answer. */
const CHAIN: ReadonlyArray<readonly [number, number]> = [
  [6, 14],
  [20, 14],
  [34, 7],
  [34, 21],
  [49, 14],
];

function NodeChainGlyph({ className = 'size-14' }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 56 28"
      className={cn('shrink-0', className)}
      fill="none"
      aria-hidden
    >
      <path
        d="M6 14H20M20 14L34 7M20 14L34 21M34 7L49 14M34 21L49 14"
        stroke="var(--color-line-strong)"
        strokeWidth="1"
      />
      {CHAIN.map(([cx, cy], i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r="2.3"
          fill="var(--color-blue-soft)"
          style={{ ...FILL_BOX, transitionDelay: `${i * 80}ms` }}
          className="opacity-50 transition duration-500 ease-out-expo group-hover/card:scale-125 group-hover/card:opacity-100"
        />
      ))}
    </svg>
  );
}

const GLYPHS: Record<string, (props: GlyphProps) => ReactElement> = {
  timeline: SparklineGlyph,
  citations: LinkedRingsGlyph,
  corrections: ConsensusPipsGlyph,
  dna: HelixGlyph,
  heatmap: HeatGridGlyph,
  reasoning: NodeChainGlyph,
};

/* The bento is a 6-column field: one double-height anchor on the left, two
   half-width cards stacked beside it, then a row of thirds underneath.

   ANCHOR_ID and the `row-span-2` entry in BENTO_SPAN must name the same
   feature — the extra area and the extra content are one decision. */
const ANCHOR_ID = 'timeline';

/* Instrument telemetry for the anchor card — the same trace the sparkline
   draws, read out in numbers. Deliberately the only place in the bento where a
   card carries a second register of information. */
const ANCHOR_READOUT = [
  { label: 'Revisions', value: '24' },
  { label: 'Span', value: '2019—now' },
  { label: 'Confidence', value: '0.91' },
] as const;

const BENTO_SPAN: Record<string, string> = {
  timeline: 'lg:col-span-3 lg:row-span-2',
  citations: 'lg:col-span-3',
  corrections: 'lg:col-span-3',
  dna: 'lg:col-span-2',
  heatmap: 'lg:col-span-2',
  reasoning: 'lg:col-span-2',
};
