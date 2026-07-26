'use client';

import { motion, type Variants } from 'framer-motion';

import {
  Button,
  InstrumentLabel,
  PulseDot,
  Reveal,
  SectionShell,
  StackedHeadline,
} from '@/components/ui';
import { scrollTo } from '@/components/providers/smooth-scroll';
import { CTA_SECTION, TELEMETRY } from '@/lib/content';
import { EASE, VIEWPORT, pickVariants, riseIn } from '@/lib/motion';
import { useDriftingValue, usePrefersReducedMotion } from '@/lib/hooks';
import { formatFull } from '@/lib/utils';

const drawY: Variants = {
  hidden: { scaleY: 0, opacity: 0 },
  visible: {
    scaleY: 1,
    opacity: 1,
    transition: { duration: 1.4, ease: EASE.outExpo },
  },
};

/**
 * The cascade has to be baked into the variant, not passed as a `delay` prop.
 * Framer Motion resolves the variant's own `transition` and throws away the
 * component-level one unless the variant opts in with `inherit: true` — so a
 * `<Reveal delay>` on top of `fadeIn` is silently inert and every line lands at
 * once. Same shape as `fadeIn`, with the offset written where it survives.
 */
const fadeAfter = (delay: number): Variants => ({
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 1.1, ease: EASE.outExpo, delay },
  },
});

/**
 * The closing frame.
 *
 * The WebGL core comes back to centre-front here, so the middle of the frame is
 * left entirely to type and the only surface in the section is a soft radial
 * pool of the page background sitting behind the words. It is tuned to lift the
 * headline off the particles without extinguishing them — the core has to
 * remain visible *through* the type, which is the whole point of ending here.
 */
export function CtaSection() {
  const reduced = usePrefersReducedMotion();
  const nodes = useDriftingValue(TELEMETRY[0].value, TELEMETRY[0].drift, 2800);

  return (
    <SectionShell
      id="cta"
      index={8}
      full
      className="flex items-center py-32 sm:py-40"
    >
      <div className="gutter relative isolate flex w-full flex-col items-center">
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 -z-10 h-[38rem] w-[58rem] max-w-[112vw] -translate-x-1/2 -translate-y-1/2"
          style={{
            background:
              'radial-gradient(closest-side, color-mix(in oklab, var(--color-void) 90%, transparent), color-mix(in oklab, var(--color-void) 66%, transparent) 42%, color-mix(in oklab, var(--color-void) 24%, transparent) 68%, transparent 84%)',
          }}
        />

        <motion.span
          aria-hidden
          className="mb-9 block h-20 w-px origin-top bg-gradient-to-b from-transparent to-blue-soft/45 sm:h-24"
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT}
          variants={pickVariants(reduced, drawY)}
        />

        <InstrumentLabel index="09" align="center">
          {CTA_SECTION.eyebrow}
        </InstrumentLabel>

        <StackedHeadline
          text={CTA_SECTION.headline}
          accent={CTA_SECTION.headlineAccent}
          size="display"
          align="center"
          className="mt-9 sm:mt-11"
        />

        <Reveal className="mt-9 w-full sm:mt-11" variants={riseIn}>
          <p className="measure mx-auto text-center text-lead text-text-2">
            {CTA_SECTION.body}
          </p>
        </Reveal>

        <Reveal
          className="mt-12 flex flex-col items-center gap-6 sm:mt-14 sm:flex-row sm:gap-8"
          variants={fadeAfter(0.12)}
        >
          <Button href={CTA_SECTION.primary.href} variant="primary" size="lg">
            {CTA_SECTION.primary.label}
          </Button>
          {/* An in-page anchor, so it glides rather than teleports. `Button`
              renders a next/link when given `href` and never forwards onClick,
              which would make the jump impossible to intercept — and a hard
              jump also fights Lenis' scroll sync on arrival. */}
          <Button
            onClick={() => scrollTo(CTA_SECTION.secondary.href)}
            variant="ghost"
            size="md"
            icon={false}
          >
            {CTA_SECTION.secondary.label}
          </Button>
        </Reveal>

        <Reveal className="mt-16 sm:mt-20" variants={fadeAfter(0.24)}>
          <p className="flex items-center gap-3 font-mono text-xs text-text-3">
            <PulseDot />
            <span className="tnum text-text-2">
              {formatFull(Math.round(nodes))}
            </span>
            <span>nodes / growing</span>
          </p>
        </Reveal>
      </div>
    </SectionShell>
  );
}
