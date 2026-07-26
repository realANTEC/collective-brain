'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import dynamic from 'next/dynamic';

import { orbit } from '@/components/three/interaction';
import {
  Headline,
  InstrumentLabel,
  Lead,
  SectionShell,
  StaggerGroup,
  StaggerItem,
} from '@/components/ui';
import { SemanticReadout } from './semantic-readout';
import { CORE_SECTION } from '@/lib/content';
import { EASE, VIEWPORT, pickVariants, riseInFlat } from '@/lib/motion';
import { usePrefersReducedMotion } from '@/lib/hooks';

/**
 * The drag surface lives in SceneCanvas, which pulls three + R3F +
 * postprocessing (~450kB) in at module scope. Reaching for it through the
 * `@/components/three` barrel would make that stack statically reachable from
 * this page and undo the whole point of the barrel's `dynamic()` wrapper, so it
 * gets its own lazy boundary. `orbit` is imported straight from
 * `interaction.ts`, which has no three.js dependency of its own.
 */
const CoreDragSurface = dynamic(
  () => import('@/components/three/SceneCanvas').then((m) => m.CoreDragSurface),
  { ssr: false },
);

/**
 * Section 02 — The Knowledge Core.
 *
 * The WebGL core is rendered by a fixed canvas *behind* the whole document, so
 * this section's job is to frame it rather than to fill itself. The middle
 * third of the grid is deliberately empty at every breakpoint: content hangs on
 * the two outer columns and the object shows through the gap between them.
 */
export function CoreSection() {
  const reduced = usePrefersReducedMotion();
  const engaged = useCoreEngagement();

  return (
    <SectionShell id="core" index={1}>
      <CoreFrame />

      {/* The drag target covers the middle third only. Full-viewport grab
          surfaces swallow text selection everywhere else on the page, and the
          z-0 keeps it under both text columns rather than over them.

          Being *under* the columns is not enough on its own: a transparent box
          is still a hit-testable box, so the z-10 grid below spans the empty
          middle and would eat every pointerdown before it reached this layer.
          The grid is therefore pointer-transparent and re-enables hits on the
          two content columns only — the gap between them stays draggable. */}
      <div
        aria-hidden
        data-cursor="grab"
        className="absolute inset-y-0 left-1/4 right-1/4 z-0 hidden cursor-grab lg:block"
      >
        <CoreDragSurface className="size-full active:cursor-grabbing" />
      </div>

      <div className="gutter pointer-events-none relative z-10 grid grid-cols-12 gap-y-16 lg:min-h-[70vh] lg:gap-x-8">
        {/* Editorial block, pinned left. */}
        <div className="pointer-events-auto col-span-12 sm:col-span-10 lg:col-span-4 lg:row-start-1 lg:pr-4">
          <InstrumentLabel index="02">{CORE_SECTION.eyebrow}</InstrumentLabel>

          <Headline
            text={CORE_SECTION.headline}
            accent={CORE_SECTION.headlineAccent}
            size="h2"
            className="mt-8"
          />

          <Lead className="mt-7">{CORE_SECTION.body}</Lead>

          <SemanticReadout />
        </div>

        {/* Facets, pinned right and dropped a beat below the headline so the
            two blocks read as a diagonal instead of a pair of columns. */}
        <div className="pointer-events-auto col-span-12 lg:col-start-9 lg:col-span-4 lg:row-start-1 lg:pt-[9vh]">
          <StaggerGroup
            as="ul"
            gap={0.11}
            delay={0.08}
            className="border-t border-line"
          >
            {CORE_SECTION.facets.map((facet) => (
              <StaggerItem
                key={facet.index}
                as="li"
                variants={riseInFlat}
                className="group/facet relative border-b border-line py-6"
              >
                {/* A lit edge that grows out of the row on hover. */}
                <span
                  aria-hidden
                  className="absolute inset-y-0 -left-5 hidden w-px origin-center scale-y-0 bg-gradient-to-b from-transparent via-blue-soft/60 to-transparent transition-transform duration-700 ease-out-expo group-hover/facet:scale-y-100 lg:block"
                />

                <div className="grid grid-cols-[1.75rem_1fr] gap-x-3">
                  <span className="label tnum pt-[0.35em] text-blue-soft/70 transition-colors duration-500 group-hover/facet:text-blue-soft">
                    {facet.index}
                  </span>

                  <div>
                    <h3 className="text-sm font-medium tracking-[-0.012em] text-text-1">
                      {facet.title}
                    </h3>
                    <p className="mt-2.5 text-xs text-text-2">{facet.body}</p>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </div>

      {/* Interaction hint. Retires itself the first time the core is touched —
          an instruction that outlives its usefulness is just noise. */}
      <div className="gutter pointer-events-none relative z-10 mt-16 hidden justify-center lg:flex">
        <AnimatePresence>
          {!engaged && (
            <motion.div
              className="glass pointer-events-none flex items-center gap-3 rounded-full px-4 py-2.5"
              initial="hidden"
              whileInView="visible"
              exit="exit"
              viewport={VIEWPORT}
              variants={pickVariants(reduced, hintIn)}
            >
              <span className="label text-blue-soft/70">Direct</span>
              <span aria-hidden className="h-3 w-px bg-line-strong" />
              <span className="text-xs text-text-2">{CORE_SECTION.hint}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </SectionShell>
  );
}

/**
 * Instrument framing for the core's negative space.
 *
 * Four corner brackets and a slow sensor sweep — enough to say "the object
 * lives here" without putting a surface over it. Desktop only: on mobile the
 * columns collapse and the core simply sits behind the stacked text.
 */
function CoreFrame() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-y-[14%] left-[28%] right-[28%] z-0 hidden lg:block"
    >
      <div className="absolute inset-0 overflow-hidden">
        <span
          className="animate-scan absolute inset-x-0 top-0 h-full opacity-30"
          style={{
            backgroundImage:
              'linear-gradient(to bottom, transparent 44%, var(--color-blue-soft) 50%, transparent 56%)',
          }}
        />
      </div>

      <span className="absolute left-0 top-0 size-6 border-l border-t border-line-strong" />
      <span className="absolute right-0 top-0 size-6 border-r border-t border-line-strong" />
      <span className="absolute bottom-0 left-0 size-6 border-b border-l border-line-strong" />
      <span className="absolute bottom-0 right-0 size-6 border-b border-r border-line-strong" />
    </div>
  );
}

const hintIn: Variants = {
  hidden: { opacity: 0, y: 12, filter: 'blur(6px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.8, delay: 0.45, ease: EASE.outExpo },
  },
  exit: {
    opacity: 0,
    y: -8,
    filter: 'blur(6px)',
    transition: { duration: 0.45, ease: EASE.outExpo },
  },
};

/**
 * `orbit` is a plain mutable object living outside React — it is written from
 * pointer handlers and read from the render loop, so there is nothing to
 * subscribe to. A quarter-second sample is imperceptible for retiring a hint
 * and costs nothing; the interval stops for good on the first engagement.
 */
function useCoreEngagement() {
  const [engaged, setEngaged] = useState(false);

  useEffect(() => {
    if (engaged) return;
    const id = setInterval(() => {
      if (orbit.engaged) setEngaged(true);
    }, 250);
    return () => clearInterval(id);
  }, [engaged]);

  return engaged;
}
