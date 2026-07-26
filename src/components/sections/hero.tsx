'use client';

import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowDown } from 'lucide-react';

import { SearchField } from '@/components/search/search-field';
import { SectionShell, TextReveal, PulseDot } from '@/components/ui';
import { HERO, TELEMETRY } from '@/lib/content';
import { EASE } from '@/lib/motion';
import { cn, formatFull } from '@/lib/utils';
import { useDriftingValue, usePrefersReducedMotion } from '@/lib/hooks';
import { scrollTo } from '@/components/providers/smooth-scroll';

/**
 * Hero.
 *
 * Composition is deliberately not "everything centred in a column". The
 * headline and field occupy the optical centre, but a status cluster is pinned
 * top-left and a telemetry bar runs the full width of the bottom edge — so the
 * frame reads as an instrument the product is running inside, rather than a
 * marketing slide. The 3D core sits behind all of it and is never occluded by
 * a solid surface.
 */
export function Hero() {
  const reduced = usePrefersReducedMotion();
  const [searching, setSearching] = useState(false);

  const onActiveChange = useCallback((active: boolean) => setSearching(active), []);

  /**
   * How the hero recedes while a question is being composed.
   *
   * Applied to the hero's own blocks rather than via a fixed overlay: an
   * overlay rendered from in here cannot be trusted to be viewport-sized
   * (an ancestor transform or leftover `filter` retargets `position: fixed`),
   * and dimming the DOM directly leaves the WebGL canvas alone — so the core
   * brightens at the same moment the page around it softens.
   *
   * Applied to plain wrapper elements, never directly to the `motion.*` nodes
   * inside them. Those nodes animate `filter` and `opacity` on entrance, which
   * leaves Framer-authored inline styles (`filter: blur(0px)`, `opacity: 1`)
   * that outrank any utility class — a `blur-[5px]` on the element itself
   * silently does nothing. Blurring an ancestor affects the whole subtree
   * regardless.
   */
  const recede = cn(
    'transition-[filter,opacity,transform] duration-700 ease-out-expo',
    searching && !reduced && 'blur-[5px] opacity-35 scale-[0.99]',
    searching && reduced && 'opacity-40',
  );

  return (
    <SectionShell
      id="hero"
      index={0}
      full
      className="flex flex-col justify-between overflow-hidden pt-28 pb-0 sm:pt-32"
    >
      {/* Status cluster */}
      <div className={recede}>
      <motion.div
        className="gutter flex items-center gap-3"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, delay: 0.15, ease: EASE.outExpo }}
      >
        <PulseDot />
        <span className="label text-text-2">Core online</span>
        <span aria-hidden className="h-px w-6 bg-line-strong sm:w-10" />
        <span className="label hidden sm:inline">
          Revision 8,412,006 · refined 4s ago
        </span>
        <span className="label sm:hidden">refined 4s ago</span>
      </motion.div>
      </div>

      {/* Optical centre */}
      <div className="gutter relative flex flex-1 flex-col items-center justify-center py-10">
        <div className={cn('flex flex-col items-center', recede)}>
        <h1
          className={cn(
            'text-display max-w-[15ch] text-center font-sans font-medium',
            // The display size is set in ch so the line break lands in the same
            // place at every viewport width rather than wherever it happens to.
          )}
        >
          <TextReveal gap={0.11} delay={0.35}>
            <span className="text-lume">{HERO.headline[0].text}</span>
            <span>
              <span className="text-lume">{HERO.headline[1].text}</span>{' '}
              <em className="text-accent-lume font-serif italic">
                {HERO.headline[1].accent}
              </em>
            </span>
          </TextReveal>
        </h1>

        <motion.p
          className="mt-7 max-w-[46ch] text-center text-lead text-text-2 sm:mt-9"
          initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 1, delay: 1.15, ease: EASE.outExpo }}
        >
          {HERO.subhead}
        </motion.p>
        </div>

        <motion.div
          // `relative z-30` is load-bearing, not decorative. The blur-in
          // entrance leaves a `filter` on this element, which makes it a
          // stacking context — so the dropdown's own `z-50` only ranks it
          // *within* here. While this wrapper stayed static it painted in flow
          // order, and every later sibling (the shortcut hint, the telemetry
          // bar) drew straight over the open panel.
          className="relative z-30 mt-10 flex w-full justify-center sm:mt-12"
          initial={{ opacity: 0, y: 26, filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 1.1, delay: 1.4, ease: EASE.outExpo }}
        >
          <SearchField onActiveChange={onActiveChange} />
        </motion.div>

        <motion.p
          className={cn('mt-6 text-center text-xs text-text-3', recede)}
          // opacity-only entrance, so no inline `filter` to fight the blur.
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.9 }}
        >
          Press{' '}
          <kbd className="rounded border border-line-strong bg-white/4 px-1.5 py-0.5 font-mono text-[0.625rem] text-text-2">
            /
          </kbd>{' '}
          to ask ·{' '}
          <kbd className="rounded border border-line-strong bg-white/4 px-1.5 py-0.5 font-mono text-[0.625rem] text-text-2">
            ⌘K
          </kbd>{' '}
          for commands
        </motion.p>
      </div>

      {/* Telemetry bar */}
      <motion.div
        className={cn('relative border-t border-line', recede)}
        // opacity/y entrance only — safe to blur via a class.
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.1, delay: 1.7, ease: EASE.outExpo }}
      >
        <div className="gutter grid grid-cols-2 md:grid-cols-4">
          {TELEMETRY.map((item, i) => (
            <TelemetryCell
              key={item.key}
              label={item.label}
              value={item.value}
              drift={item.drift}
              className={cn(
                'border-line py-5 md:py-6',
                i % 2 === 0 && 'border-r md:border-r',
                i < 2 && 'border-b md:border-b-0',
                i === 1 && 'md:border-r',
                i === 2 && 'md:border-r',
                i > 0 && 'pl-5 md:pl-6',
              )}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => scrollTo('#core')}
          className="group absolute right-4 -top-16 hidden items-center gap-2 lg:flex xl:right-8"
          aria-label="Scroll to the Knowledge Core"
        >
          <span className="label transition-colors group-hover:text-text-1">
            Scroll
          </span>
          <span className="grid size-9 place-items-center rounded-full border border-line-strong transition-colors duration-500 group-hover:border-blue-soft/60">
            <motion.span
              animate={reduced ? undefined : { y: [0, 3, 0] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <ArrowDown className="size-3.5 text-text-2" strokeWidth={1.75} />
            </motion.span>
          </span>
        </button>
      </motion.div>
    </SectionShell>
  );
}

/**
 * One telemetry readout. The value wanders continuously by a small amount —
 * a static number in a "live system" panel is the fastest way to break the
 * illusion that anything is actually running.
 */
function TelemetryCell({
  label,
  value,
  drift,
  className,
}: {
  label: string;
  value: number;
  drift: number;
  className?: string;
}) {
  const live = useDriftingValue(value, drift, 2400);

  return (
    <div className={className}>
      <div className="tnum font-mono text-sm text-text-1 sm:text-base">
        {formatFull(Math.round(live))}
      </div>
      <div className="mt-1.5 text-[0.6875rem] text-text-3 sm:text-xs">
        {label}
      </div>
    </div>
  );
}
