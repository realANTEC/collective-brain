'use client';

import { motion, type Variants } from 'framer-motion';
import { Children, type ReactNode } from 'react';
import {
  VIEWPORT,
  pickVariants,
  riseIn,
  lineReveal,
  stagger,
} from '@/lib/motion';
import { usePrefersReducedMotion } from '@/lib/hooks';
import { cn } from '@/lib/utils';

/**
 * The single reveal primitive.
 *
 * Every "content arrives" animation on the site funnels through here so the
 * timing vocabulary stays identical everywhere - and so reduced-motion is
 * handled in exactly one place rather than in forty components.
 */
export function Reveal({
  children,
  className,
  variants = riseIn,
  delay = 0,
  as = 'div',
}: {
  children: ReactNode;
  className?: string;
  variants?: Variants;
  delay?: number;
  as?: 'div' | 'span' | 'li' | 'section' | 'article';
}) {
  const reduced = usePrefersReducedMotion();
  const Component = motion[as];

  return (
    <Component
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT}
      variants={pickVariants(reduced, variants)}
      transition={delay ? { delay } : undefined}
    >
      {children}
    </Component>
  );
}

/**
 * Staggered group. Children must be <Reveal> or motion elements carrying the
 * matching variant names ("hidden" / "visible").
 */
export function StaggerGroup({
  children,
  className,
  gap = 0.06,
  delay = 0,
  as = 'div',
}: {
  children: ReactNode;
  className?: string;
  gap?: number;
  delay?: number;
  as?: 'div' | 'ul' | 'section';
}) {
  const Component = motion[as];

  return (
    <Component
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT}
      variants={stagger(gap, delay)}
    >
      {children}
    </Component>
  );
}

/** A child of StaggerGroup. Inherits the parent's orchestration. */
export function StaggerItem({
  children,
  className,
  variants = riseIn,
  as = 'div',
}: {
  children: ReactNode;
  className?: string;
  variants?: Variants;
  as?: 'div' | 'li' | 'span' | 'article';
}) {
  const reduced = usePrefersReducedMotion();
  const Component = motion[as];

  return (
    <Component className={className} variants={pickVariants(reduced, variants)}>
      {children}
    </Component>
  );
}

/**
 * Line-by-line editorial reveal.
 *
 * Each line gets its own overflow-hidden clip so the text slides up from
 * behind its own baseline. The clip is the entire effect - without it this is
 * just a fade, and the difference is what makes large type feel typeset rather
 * than animated.
 *
 * `pb-[0.12em]` on the clip is deliberate: descenders (g, y, p) sit below the
 * baseline and get sheared off by a tight overflow box.
 */
export function TextReveal({
  children,
  className,
  lineClassName,
  gap = 0.08,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  lineClassName?: string;
  gap?: number;
  delay?: number;
}) {
  const reduced = usePrefersReducedMotion();
  const lines = Children.toArray(children);

  return (
    <motion.span
      className={cn('block', className)}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT}
      variants={stagger(gap, delay)}
    >
      {lines.map((line, i) => (
        <span
          key={i}
          className={cn(
            'block overflow-hidden pb-[0.12em] [transform:translateZ(0)]',
            lineClassName,
          )}
        >
          <motion.span
            className="block origin-bottom"
            variants={pickVariants(reduced, lineReveal)}
          >
            {line}
          </motion.span>
        </span>
      ))}
    </motion.span>
  );
}
