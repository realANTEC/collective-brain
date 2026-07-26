'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { VIEWPORT, pickVariants, riseIn, drawX } from '@/lib/motion';
import { usePrefersReducedMotion } from '@/lib/hooks';
import { TextReveal } from './reveal';

/**
 * Section wrapper.
 *
 * `data-section` is what the SectionTracker observes to drive the scroll rail
 * and the WebGL choreography, so every top-level section must use this rather
 * than a bare <section>.
 */
export function SectionShell({
  id,
  index,
  children,
  className,
  full = false,
}: {
  id: string;
  index: number;
  children: ReactNode;
  className?: string;
  /** Full-viewport-height sections (hero, CTA) opt out of the vertical rhythm. */
  full?: boolean;
}) {
  return (
    <section
      id={id}
      data-section={id}
      data-section-index={index}
      className={cn(
        // overflow-x-clip, not overflow-hidden: sections carry decorative glow
        // layers sized in vw (deliberately wider than the viewport), and
        // without a clip those expand the layout viewport on mobile — Chrome
        // then shrink-to-fits the whole page and fixed-position chrome runs off
        // the right edge. `clip` contains them without creating a scroll
        // container, so `position: sticky` inside sections still works.
        'relative overflow-x-clip',
        full ? 'min-h-[100svh]' : 'section-y',
        className,
      )}
    >
      {children}
    </section>
  );
}

/**
 * The instrument eyebrow: a monospaced index, a hairline, and a label.
 * This one component is most of what makes the page read as an instrument
 * panel rather than a marketing site.
 */
export function InstrumentLabel({
  index,
  children,
  className,
  align = 'left',
}: {
  index?: string;
  children: ReactNode;
  className?: string;
  align?: 'left' | 'center';
}) {
  const reduced = usePrefersReducedMotion();

  return (
    <motion.div
      className={cn(
        'flex items-center gap-3',
        align === 'center' && 'justify-center',
        className,
      )}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT}
      variants={pickVariants(reduced, riseIn)}
    >
      {index && (
        <span className="label tnum text-blue-soft/70">{index}</span>
      )}
      <motion.span
        aria-hidden
        className="h-px w-8 origin-left bg-line-strong"
        variants={pickVariants(reduced, drawX)}
      />
      <span className="label">{children}</span>
    </motion.div>
  );
}

/**
 * The house headline.
 *
 * Structure is always the same: a neutral phrase in the variable grotesk,
 * then exactly one word or short phrase set in Instrument Serif italic. One
 * accent per heading, never two - the moment a second appears the device stops
 * reading as emphasis and starts reading as decoration.
 */
export function Headline({
  text,
  accent,
  size = 'h2',
  className,
  align = 'left',
  delay = 0,
}: {
  text: string;
  accent?: string;
  size?: 'display' | 'h1' | 'h2' | 'h3';
  className?: string;
  align?: 'left' | 'center';
  delay?: number;
}) {
  const sizeClass = {
    display: 'text-display',
    h1: 'text-h1',
    h2: 'text-h2',
    h3: 'text-h3',
  }[size];

  return (
    <h2
      className={cn(
        sizeClass,
        'font-sans font-medium',
        align === 'center' && 'text-center',
        className,
      )}
    >
      <TextReveal delay={delay}>
        <>
          <span className="text-lume">{text}</span>
          {accent && (
            <>
              {' '}
              <em className="text-accent-lume font-serif italic">
                {accent}
              </em>
            </>
          )}
        </>
      </TextReveal>
    </h2>
  );
}

/** Headline whose two halves land on separate lines. */
export function StackedHeadline({
  text,
  accent,
  size = 'h2',
  className,
  align = 'left',
}: {
  text: string;
  accent: string;
  size?: 'display' | 'h1' | 'h2' | 'h3';
  className?: string;
  align?: 'left' | 'center';
}) {
  const sizeClass = {
    display: 'text-display',
    h1: 'text-h1',
    h2: 'text-h2',
    h3: 'text-h3',
  }[size];

  return (
    <h2
      className={cn(
        sizeClass,
        'font-sans font-medium',
        align === 'center' && 'text-center',
        className,
      )}
    >
      <TextReveal>
        <span className="text-lume">{text}</span>
        <em className="text-accent-lume font-serif italic">
          {accent}
        </em>
      </TextReveal>
    </h2>
  );
}

/** Standard lead paragraph. Constrained to a readable measure. */
export function Lead({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduced = usePrefersReducedMotion();

  return (
    <motion.p
      className={cn('text-lead measure text-text-2', className)}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT}
      variants={pickVariants(reduced, riseIn)}
      transition={{ delay }}
    >
      {children}
    </motion.p>
  );
}

/**
 * A full-width hairline that draws itself in on entry.
 *
 * Two elements, deliberately. The outer div is the in-view target and keeps its
 * full width; the inner span is what collapses to `scaleX: 0`. If the animated
 * element observed itself, its zero-area bounding box could never register as
 * intersecting, `whileInView` would never fire, and the rule would stay
 * invisible — a failure that shows up on some viewport widths and not others.
 */
export function Rule({ className }: { className?: string }) {
  const reduced = usePrefersReducedMotion();

  return (
    <motion.div
      aria-hidden
      className={cn('w-full', className)}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT}
    >
      <motion.span
        className="rule block origin-left"
        variants={pickVariants(reduced, drawX)}
      />
    </motion.div>
  );
}
