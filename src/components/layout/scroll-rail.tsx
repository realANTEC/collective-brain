'use client';

import { motion } from 'framer-motion';

import { scrollTo } from '@/components/providers/smooth-scroll';
import { SECTIONS } from '@/lib/content';
import { EASE } from '@/lib/motion';
import { useSceneSnapshot } from '@/lib/hooks';
import { cn } from '@/lib/utils';

/**
 * Section rail.
 *
 * Desktop only, and deliberately absent over the hero — an "you are here"
 * indicator at position one of nine is noise, not orientation. It arrives the
 * moment the reader commits to the page and then stays.
 *
 * Each row's label is absolutely positioned outside the button box so the
 * invisible text can never intercept pointer events over the content beneath.
 */
export function ScrollRail() {
  const { section } = useSceneSnapshot();
  const visible = section >= 1;

  return (
    <nav
      aria-label="Section progress"
      // The rail is only faded out, so without `inert` all nine buttons stay in
      // the tab order over the hero: focus would land on invisible controls
      // whose :focus-visible ring renders at opacity 0. `inert` takes the whole
      // landmark out of the tab order and the a11y tree with no layout change.
      inert={!visible}
      aria-hidden={!visible}
      className="fixed top-1/2 right-0 z-20 hidden -translate-y-1/2 pr-5 lg:block xl:pr-7"
    >
      <motion.ul
        className={cn(
          'relative flex flex-col items-end',
          // Redundant where `inert` is supported; kept as the pointer fallback.
          !visible && 'pointer-events-none',
        )}
        initial={false}
        animate={{ opacity: visible ? 1 : 0, x: visible ? 0 : 14 }}
        transition={{ duration: 0.7, ease: EASE.outExpo }}
      >
        <span aria-hidden className="rule-v absolute inset-y-1 right-0" />

        {SECTIONS.map((entry, i) => (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => scrollTo(`#${entry.id}`)}
              aria-label={`Go to ${entry.label}`}
              aria-current={i === section ? 'location' : undefined}
              className="group relative flex items-center justify-end py-[7px] pl-6"
            >
              <span
                className={cn(
                  'pointer-events-none absolute right-full mr-3 flex items-baseline gap-2.5',
                  'translate-x-3 opacity-0 transition-all duration-500 ease-out-expo',
                  'group-hover:translate-x-0 group-hover:opacity-100',
                  'group-focus-visible:translate-x-0 group-focus-visible:opacity-100',
                )}
              >
                <span className="label tnum text-blue-soft/70">
                  {entry.index}
                </span>
                <span className="text-xs whitespace-nowrap text-text-2">
                  {entry.label}
                </span>
              </span>

              <span
                aria-hidden
                className={cn(
                  'h-px shrink-0 transition-all duration-500 ease-out-expo',
                  i === section
                    ? 'w-9 bg-blue-soft shadow-[0_0_10px_rgba(110,144,255,0.75)]'
                    : 'w-3.5 bg-white/22 group-hover:w-6 group-hover:bg-white/45',
                )}
              />
            </button>
          </li>
        ))}
      </motion.ul>
    </nav>
  );
}
