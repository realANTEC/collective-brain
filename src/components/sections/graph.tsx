'use client';

import { useRef } from 'react';
import { motion, useScroll, useSpring } from 'framer-motion';

import {
  InstrumentLabel,
  Lead,
  Marquee,
  PulseDot,
  SectionShell,
  StackedHeadline,
  StaggerGroup,
  StaggerItem,
} from '@/components/ui';
import { ACTIVITY, GRAPH_SECTION } from '@/lib/content';
import { riseInFlat } from '@/lib/motion';
import { usePrefersReducedMotion } from '@/lib/hooks';
import { cn, formatAgo } from '@/lib/utils';

/**
 * Expansion.
 *
 * The camera is inside the WebGL core for this section, so the DOM deliberately
 * hugs the outer columns and leaves columns six and seven empty — the core is
 * the centre of the composition and nothing is allowed to sit on top of it.
 */
export function GraphSection() {
  const reduced = usePrefersReducedMotion();
  const railRef = useRef<HTMLDivElement>(null);

  // The rail fill is bound to the list's own scroll span rather than the
  // section's, so the line reaches the last node exactly as that node lands.
  const { scrollYProgress } = useScroll({
    target: railRef,
    offset: ['start 78%', 'end 62%'],
  });
  const railFill = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 26,
    mass: 0.4,
  });

  const { events } = GRAPH_SECTION;
  const total = events[events.length - 1].t;

  return (
    <SectionShell id="graph" index={4} className="relative">
      <div className="gutter">
        <div className="grid gap-y-16 lg:grid-cols-12 lg:gap-x-8">
          {/* ── Editorial column ──────────────────────────────────────────── */}
          <div className="relative lg:col-span-5">
            <Scrim from="0%" />
            <div className="relative">
              <InstrumentLabel index="05">
                {GRAPH_SECTION.eyebrow}
              </InstrumentLabel>
              <StackedHeadline
                className="mt-7"
                text={GRAPH_SECTION.headline}
                accent={GRAPH_SECTION.headlineAccent}
              />
              <Lead className="mt-8">{GRAPH_SECTION.body}</Lead>
            </div>
          </div>

          {/* ── Execution trace ───────────────────────────────────────────── */}
          <div className="relative lg:col-start-8 lg:col-span-5">
            <Scrim from="100%" />

            <div className="relative">
              <div className="flex items-baseline justify-between gap-4 border-b border-line pb-4">
                <span className="label">Execution trace</span>
                <span className="tnum font-mono text-[0.6875rem] tracking-[0.16em] text-blue-soft/75">
                  {total}
                </span>
              </div>

              <div ref={railRef} className="relative pt-6">
                {/* Rail x = timestamp column (3.25rem) + column gap (0.75rem)
                    + half the dot column (0.75rem). Both values must stay in
                    step with the grid template on the rows below. */}
                <span
                  aria-hidden
                  className="absolute top-12 bottom-12 left-[4.75rem] w-px -translate-x-1/2 bg-line sm:left-[5.875rem]"
                />
                <motion.span
                  aria-hidden
                  className="absolute top-12 bottom-12 left-[4.75rem] w-px origin-top shadow-[0_0_12px_rgba(110,144,255,0.55)] sm:left-[5.875rem]"
                  style={{
                    x: '-50%',
                    scaleY: reduced ? 1 : railFill,
                    background:
                      'linear-gradient(180deg, var(--color-blue), var(--color-violet) 55%, var(--color-cyan))',
                  }}
                />

                <StaggerGroup as="ul" className="relative" gap={0.09}>
                  {events.map((event, i) => (
                    <TraceRow
                      key={event.t}
                      event={event}
                      last={i === events.length - 1}
                    />
                  ))}
                </StaggerGroup>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Continuous activity ─────────────────────────────────────────────
          Full-bleed on purpose: the band runs edge to edge under the columns so
          it reads as a system log scrolling past, not a carousel in a card. */}
      <div className="relative mt-24 border-y border-line lg:mt-32">
        <div className="gutter flex items-center gap-4 border-b border-line py-3.5">
          <PulseDot />
          <span className="label text-text-2">Continuous activity</span>
          <span aria-hidden className="h-px flex-1 bg-line" />
          <span className="tnum label hidden sm:inline">
            {ACTIVITY.length} events in window
          </span>
        </div>

        <Marquee speed={55}>
          {ACTIVITY.map((item, i) => (
            <div
              key={`${item.actor}-${item.region}`}
              className="flex shrink-0 items-center gap-4 border-r border-line px-6 py-4"
            >
              <span className="tnum shrink-0 font-mono text-[0.625rem] tracking-[0.14em] text-text-4">
                {formatAgo(3 + i * 9)}
              </span>
              <span
                aria-hidden
                className="size-1 shrink-0 rounded-full bg-blue-soft/60"
              />
              <span className="shrink-0 font-mono text-[0.625rem] tracking-[0.16em] whitespace-nowrap text-text-3 uppercase">
                {item.actor} · {item.region}
              </span>
              <span className="shrink-0 text-xs whitespace-nowrap text-text-3">
                {item.action}
              </span>
              <span className="shrink-0 text-xs whitespace-nowrap text-text-1">
                {item.target}
              </span>
            </div>
          ))}
        </Marquee>
      </div>
    </SectionShell>
  );
}

/* -------------------------------------------------------------------------- */

function TraceRow({
  event,
  last,
}: {
  event: (typeof GRAPH_SECTION.events)[number];
  last: boolean;
}) {
  return (
    <StaggerItem
      as="li"
      variants={riseInFlat}
      className={cn(
        'group relative grid grid-cols-[3.25rem_1.5rem_1fr] items-start gap-x-3 py-3.5',
        'sm:grid-cols-[4rem_1.75rem_1fr] sm:gap-x-4',
      )}
    >
      {last && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-6 right-0"
          style={{
            background:
              'radial-gradient(58% 130% at 18% 50%, rgba(110,231,245,0.09), transparent 72%)',
          }}
        />
      )}

      <span
        className={cn(
          'tnum relative pt-px text-right font-mono text-xs',
          last ? 'text-cyan/85' : 'text-text-3',
        )}
      >
        {event.t}
      </span>

      <span className="relative flex h-5 items-center justify-center">
        {last && (
          <span
            aria-hidden
            className="animate-pulse-ring absolute size-[7px] rounded-full bg-cyan/55"
          />
        )}
        <span
          aria-hidden
          className={cn(
            'relative block rounded-full transition-colors duration-500',
            last
              ? 'size-[7px] bg-cyan shadow-[0_0_14px_2px_rgba(110,231,245,0.6)]'
              : 'size-[6px] bg-surface-4 ring-1 ring-line-strong group-hover:bg-blue-soft/70',
          )}
        />
      </span>

      <div className="relative min-w-0">
        <div
          className={cn(
            'text-sm transition-colors duration-500',
            last ? 'text-text-1' : 'text-text-1/90',
          )}
        >
          {event.label}
        </div>
        <p className="mt-1 text-xs text-text-3">{event.detail}</p>
      </div>
    </StaggerItem>
  );
}

/**
 * A soft scrim that darkens the void behind a text column.
 *
 * The 3D core renders live behind this section, and moving highlights under
 * body copy destroy legibility. The gradient falls off well before the middle
 * columns so the core stays completely unobstructed.
 */
function Scrim({ from }: { from: '0%' | '100%' }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute -inset-x-8 -inset-y-10 hidden lg:block"
      style={{
        background: `radial-gradient(80% 70% at ${from} 50%, rgb(5 5 8 / 0.88), rgb(5 5 8 / 0.45) 55%, transparent 78%)`,
      }}
    />
  );
}
