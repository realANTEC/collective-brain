'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { BOOT_SEQUENCE } from '@/lib/content';
import { EASE } from '@/lib/motion';
import { usePrefersReducedMotion } from '@/lib/hooks';
import { setReady } from '@/lib/scene-state';
import { cn } from '@/lib/utils';

const SESSION_KEY = 'cb:booted';

const STEP_MS = 380;
/** How long the final line holds before the wipe starts. */
const TAIL_MS = 340;
const REDUCED_MS = 300;
const WIPE_S = 0.6;

/** Hard ceiling. Nothing about a loading screen may ever gate the page. */
const FAILSAFE_MS = 2600;

const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

const ORBITS = [
  { radius: 54, size: 2.1, period: 9, delay: 0, fill: 'var(--color-cyan)' },
  {
    radius: 66,
    size: 1.7,
    period: 14,
    delay: -4.5,
    fill: 'var(--color-violet-soft)',
  },
  {
    radius: 40,
    size: 1.5,
    period: 6.5,
    delay: -2.2,
    fill: 'var(--color-blue-soft)',
  },
];

/**
 * Boot sequence.
 *
 * A loading screen treated as a frame of the film rather than a spinner: an
 * instrument mark at the optical centre, a system log running along the bottom
 * left, and one hairline of progress across the very bottom edge of the
 * viewport. It never blocks — three independent timers race to the same
 * idempotent `finish`, and the outermost fires at 2.6s no matter what.
 */
export function Preloader() {
  const reduced = usePrefersReducedMotion();

  /** null until sessionStorage has been read. See the layout effect below. */
  const [armed, setArmed] = useState<boolean | null>(null);
  const [step, setStep] = useState(-1);
  const [done, setDone] = useState(false);
  const settled = useRef(false);

  // Reading sessionStorage in a *layout* effect keeps the decision ahead of the
  // first paint. A returning visitor therefore never sees a frame of the boot
  // screen, and a first-time visitor never sees a frame of the bare page —
  // which is exactly what a useEffect here would cost.
  useIsomorphicLayoutEffect(() => {
    setArmed(window.sessionStorage.getItem(SESSION_KEY) !== '1');
  }, []);

  useEffect(() => {
    if (armed === false) setReady(true);
  }, [armed]);

  useEffect(() => {
    if (armed !== true) return;

    const timers: number[] = [];
    const finish = () => {
      if (settled.current) return;
      settled.current = true;
      window.sessionStorage.setItem(SESSION_KEY, '1');
      setReady(true);
      setDone(true);
    };

    if (reduced) {
      setStep(BOOT_SEQUENCE.length - 1);
      timers.push(window.setTimeout(finish, REDUCED_MS));
    } else {
      BOOT_SEQUENCE.forEach((_, i) => {
        timers.push(window.setTimeout(() => setStep(i), i * STEP_MS));
      });
      timers.push(
        window.setTimeout(
          finish,
          (BOOT_SEQUENCE.length - 1) * STEP_MS + TAIL_MS,
        ),
      );
    }

    timers.push(window.setTimeout(finish, FAILSAFE_MS));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [armed, reduced]);

  if (armed === false) return null;

  const progress = (step + 1) / BOOT_SEQUENCE.length;
  const pct = Math.round(progress * 100);

  return (
    <AnimatePresence>
      {!done && (
        <motion.div key="cb-preloader" className="fixed inset-0 z-[200]">
          {/* The wipe collapses toward the bottom edge, so the page is revealed
              head-first — the headline lands before anything below it. */}
          <motion.div
            className="absolute inset-0 overflow-hidden bg-void"
            role="progressbar"
            aria-label="Loading the Knowledge Core"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            initial={{ clipPath: 'inset(0% 0% 0% 0%)' }}
            animate={{ clipPath: 'inset(0% 0% 0% 0%)' }}
            exit={
              reduced
                ? { opacity: 0 }
                : { clipPath: 'inset(100% 0% 0% 0%)' }
            }
            transition={
              reduced
                ? { duration: 0.2 }
                : { duration: WIPE_S, ease: EASE.outExpo }
            }
          >
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  'radial-gradient(56% 42% at 50% 46%, color-mix(in oklab, var(--color-blue) 15%, transparent), transparent 72%)',
              }}
            />
            <div
              aria-hidden
              className="grid-lines mask-fade-y absolute inset-0 opacity-60"
            />
            <div
              aria-hidden
              className="grain absolute inset-0 opacity-[0.04] mix-blend-overlay"
            />

            <div className="relative flex h-full flex-col">
              <div className="gutter flex items-center justify-between pt-8 sm:pt-10">
                <span className="label text-text-2">Collective Brain</span>
                <span className="label flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className="size-1 rounded-full bg-cyan shadow-[0_0_8px_rgba(110,231,245,0.9)]"
                  />
                  {step >= BOOT_SEQUENCE.length - 1
                    ? 'Core online'
                    : 'Initialising'}
                </span>
              </div>

              <div className="flex flex-1 items-center justify-center">
                <BootMark progress={progress} reduced={reduced} />
              </div>

              <div className="gutter flex items-end justify-between gap-6 pb-10 sm:pb-14">
                <ol aria-hidden className="flex flex-col gap-[0.45rem]">
                  {BOOT_SEQUENCE.map((line, i) => {
                    const shown = i <= step;
                    const current = i === step;
                    return (
                      <motion.li
                        key={line}
                        className="flex items-baseline gap-3 font-mono text-[0.6875rem] leading-none sm:text-xs"
                        initial={reduced ? false : { opacity: 0, x: -8 }}
                        animate={{ opacity: shown ? 1 : 0, x: shown ? 0 : -8 }}
                        transition={
                          reduced
                            ? { duration: 0 }
                            : { duration: 0.55, ease: EASE.outExpo }
                        }
                      >
                        <span className="tnum text-blue-soft/70">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span
                          className={cn(
                            'transition-colors duration-500',
                            current ? 'text-text-1' : 'text-text-3',
                          )}
                        >
                          {line}
                        </span>
                        {current && !reduced ? (
                          <span className="animate-caret inline-block h-[0.85em] w-px translate-y-[0.1em] bg-blue-soft" />
                        ) : shown ? (
                          <span className="text-[0.5625rem] tracking-[0.22em] text-text-4">
                            OK
                          </span>
                        ) : null}
                      </motion.li>
                    );
                  })}
                </ol>

                <div className="shrink-0 text-right">
                  <div className="tnum font-mono text-sm text-text-1 sm:text-base">
                    {String(pct).padStart(3, '0')}
                    <span className="text-text-3">%</span>
                  </div>
                  <div className="label mt-2 text-[0.5625rem]">Loaded</div>
                </div>
              </div>
            </div>

            <div
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-px bg-white/6"
            >
              <motion.div
                className="relative h-full"
                style={{
                  background:
                    'linear-gradient(90deg, var(--color-blue-deep), var(--color-blue) 45%, var(--color-violet) 78%, var(--color-cyan))',
                }}
                initial={{ width: '0%' }}
                animate={{ width: `${progress * 100}%` }}
                transition={{
                  duration: reduced ? 0 : 0.55,
                  ease: EASE.outExpo,
                }}
              >
                <span className="absolute top-1/2 right-0 size-[3px] -translate-y-1/2 rounded-full bg-cyan shadow-[0_0_10px_2px_rgba(110,231,245,0.75)]" />
              </motion.div>
            </div>
          </motion.div>

          {/* The lit edge of the wipe. Its easing matches the clip-path exactly,
              so it sits on the reveal front rather than chasing it. */}
          {!reduced && (
            <motion.div
              aria-hidden
              className="absolute inset-x-0 top-0 h-px"
              style={{
                background:
                  'linear-gradient(90deg, transparent, var(--color-blue-soft) 30%, var(--color-cyan) 70%, transparent)',
              }}
              initial={{ y: '0vh', opacity: 0 }}
              animate={{ y: '0vh', opacity: 0 }}
              exit={{ y: '100vh', opacity: [0, 1, 0.85, 0] }}
              transition={{ duration: WIPE_S, ease: EASE.outExpo }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * The mark.
 *
 * One arc bound to real progress, one dashed ring turning at a constant rate,
 * and three dots on independent orbits. The orbits are CSS animations reusing
 * the global `orbit` keyframe rather than JS: `transform-box: view-box` is what
 * lets a transform-origin in user units rotate an SVG group about the mark's
 * centre instead of its own bounding box.
 */
function BootMark({
  progress,
  reduced,
}: {
  progress: number;
  reduced: boolean;
}) {
  const r = 54;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-20 rounded-full"
        style={{
          background:
            'radial-gradient(closest-side, color-mix(in oklab, var(--color-blue) 20%, transparent), transparent 72%)',
        }}
      />

      <svg
        width={140}
        height={140}
        viewBox="0 0 140 140"
        className="relative"
        aria-hidden
      >
        <defs>
          <linearGradient id="cb-boot-arc" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-blue)" />
            <stop offset="52%" stopColor="var(--color-violet)" />
            <stop offset="100%" stopColor="var(--color-cyan)" />
          </linearGradient>
        </defs>

        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke="rgb(255 255 255 / 0.07)"
          strokeWidth="1"
        />

        <g
          style={
            reduced
              ? undefined
              : {
                  animation: 'orbit 26s linear infinite',
                  transformBox: 'view-box',
                  transformOrigin: '70px 70px',
                }
          }
        >
          <circle
            cx="70"
            cy="70"
            r="36"
            fill="none"
            stroke="rgb(255 255 255 / 0.13)"
            strokeWidth="1"
            strokeDasharray="1.5 9"
          />
        </g>

        <g transform="rotate(-90 70 70)">
          <motion.circle
            cx="70"
            cy="70"
            r={r}
            fill="none"
            stroke="url(#cb-boot-arc)"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeDasharray={circumference}
            style={{ filter: 'drop-shadow(0 0 6px rgb(110 144 255 / 0.6))' }}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference * (1 - progress) }}
            transition={{
              duration: reduced ? 0 : 0.6,
              ease: EASE.outExpo,
            }}
          />
        </g>

        {ORBITS.map((orbit) => (
          <g
            key={orbit.radius}
            style={
              reduced
                ? undefined
                : {
                    animation: `orbit ${orbit.period}s linear ${orbit.delay}s infinite`,
                    transformBox: 'view-box',
                    transformOrigin: '70px 70px',
                  }
            }
          >
            <circle
              cx="70"
              cy={70 - orbit.radius}
              r={orbit.size}
              fill={orbit.fill}
            />
          </g>
        ))}

        <circle
          cx="70"
          cy="70"
          r="2.5"
          fill="var(--color-text-1)"
          className={reduced ? undefined : 'animate-breathe'}
          style={{ transformBox: 'view-box', transformOrigin: '70px 70px' }}
        />
      </svg>
    </div>
  );
}
