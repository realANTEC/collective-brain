'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import {
  GlassPanel,
  InstrumentLabel,
  Lead,
  PulseDot,
  SectionShell,
  StackedHeadline,
  StaggerGroup,
  StaggerItem,
  StatusPill,
} from '@/components/ui';
import { ACTIVITY, VALIDATION_SECTION } from '@/lib/content';
import { EASE, VIEWPORT, riseInFlat } from '@/lib/motion';
import { usePrefersReducedMotion } from '@/lib/hooks';
import { cn } from '@/lib/utils';

/** Column template for the ledger. Shared by the header row and every record. */
const LEDGER_COLS =
  'lg:grid-cols-[minmax(0,2.2fr)_8.5rem_9.5rem_8.5rem_minmax(0,2fr)]';

const COLUMNS = ['Claim', 'Status', 'Quorum', 'Delta', 'Note'] as const;

/**
 * Validation.
 *
 * The ledger is the signature element and it is built as an actual data
 * structure — a role-based grid rather than a stack of cards — because the
 * argument of the section is that review is bookkeeping, not vibes. Below it
 * the four principles run as an editorial 2x2 with nothing but hairlines
 * between them, so the eye leaves the section on prose rather than chrome.
 */
export function ValidationSection() {
  return (
    <SectionShell id="validation" index={6} className="isolate">
      {/* The section's one soft glow, held up in the header band beside the
          ticker. It used to sit at 14% — directly behind the ledger, adding
          light under the smallest type on the page. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-[-5%] left-[62%] -z-10 h-[30rem] w-[44rem] max-w-[120vw] -translate-x-1/2"
        style={{
          background:
            'radial-gradient(closest-side, color-mix(in oklab, var(--color-violet) 12%, transparent), transparent)',
        }}
      />

      <div className="gutter">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-7">
            <InstrumentLabel index="07">
              {VALIDATION_SECTION.eyebrow}
            </InstrumentLabel>
            <StackedHeadline
              className="mt-8"
              text={VALIDATION_SECTION.headline}
              accent={VALIDATION_SECTION.headlineAccent}
            />
            <Lead className="mt-9">{VALIDATION_SECTION.body}</Lead>
          </div>

          <div className="lg:col-span-4 lg:col-start-9 lg:self-end">
            <ActivityTicker />
          </div>
        </div>

        {/* ── The correction ledger ───────────────────────────────────── */}
        <div className="relative mt-20 lg:mt-32">
          <Scrim />

          <div className="relative">
            <div className="mb-5 flex items-baseline justify-between gap-6">
              <span className="label">Correction ledger</span>
              <span className="label tnum text-text-4">
                {String(VALIDATION_SECTION.ledger.length).padStart(2, '0')}{' '}
                records
              </span>
            </div>

            <div
              role="table"
              aria-label="Correction ledger"
              className="border-b border-line"
            >
              <div
                role="row"
                className={cn(
                  'hidden border-t border-line-strong py-3.5 lg:grid lg:items-center lg:gap-7 lg:px-5',
                  LEDGER_COLS,
                )}
              >
                {COLUMNS.map((column) => (
                  <span key={column} role="columnheader" className="label">
                    {column}
                  </span>
                ))}
              </div>

              {VALIDATION_SECTION.ledger.map((entry, i) => (
                <LedgerRow key={entry.id} entry={entry} order={i} />
              ))}
            </div>
          </div>
        </div>

        {/* ── Principles ──────────────────────────────────────────────── */}
        <StaggerGroup
          gap={0.08}
          className="mt-24 grid border-t border-line md:grid-cols-2 lg:mt-36"
        >
          {VALIDATION_SECTION.principles.map((principle, i) => (
            <StaggerItem
              key={principle.title}
              variants={riseInFlat}
              className={cn(
                'flex gap-6 border-b border-line py-10 lg:py-12',
                i % 2 === 0 ? 'md:border-r md:pr-12' : 'md:pl-12',
              )}
            >
              <span className="label tnum mt-2 shrink-0 text-blue-soft/70">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <h3 className="text-h3 font-sans font-medium text-text-1">
                  {principle.title}
                </h3>
                <p className="measure mt-4 text-body text-text-2">
                  {principle.body}
                </p>
              </div>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </SectionShell>
  );
}

/**
 * A soft scrim that darkens the void behind the ledger.
 *
 * Keyframe 07 holds the WebGL core at 0.74 opacity with the connection network
 * almost fully drawn, and the Atmosphere only vignettes the top and bottom of
 * the viewport — so a moving point cloud runs directly under the smallest type
 * on the page. Same device as the graph section, and the reason is the same:
 * moving highlights under body copy destroy legibility.
 *
 * Two shapes. On lg the ledger is a wide block roughly a viewport tall and the
 * ellipse fits it. Stacked, each record becomes five labelled rows and the
 * table runs several viewports — a radial would only protect whatever happened
 * to sit near its centre, so that one gets an even wash masked at the sides.
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

/* ══════════════════════════════════════════════════════════════════════════
   LEDGER
   ══════════════════════════════════════════════════════════════════════════ */

type LedgerEntry = (typeof VALIDATION_SECTION.ledger)[number];

function LedgerRow({ entry, order }: { entry: LedgerEntry; order: number }) {
  const reduced = usePrefersReducedMotion();

  return (
    <motion.div
      role="row"
      // Concrete values rather than named variants: the quorum pips inside run
      // their own in-view timeline and must not inherit this row's state.
      initial={reduced ? false : { opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{ duration: 0.6, ease: EASE.outExpo, delay: order * 0.05 }}
      className={cn(
        'group relative grid gap-4 border-t border-line px-4 py-6',
        'transition-colors duration-500 hover:bg-white/3',
        'lg:items-center lg:gap-7 lg:px-5 lg:py-5',
        LEDGER_COLS,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute inset-y-0 left-0 w-px origin-top scale-y-0 bg-blue-soft/80',
          'transition-transform duration-500 ease-out-expo group-hover:scale-y-100',
        )}
      />

      <Field label="Claim">
        <span className="text-body text-text-1">{entry.claim}</span>
      </Field>

      <Field label="Status" className="items-center">
        <StatusPill tone={entry.status}>{entry.status}</StatusPill>
      </Field>

      <Field label="Quorum" className="items-center">
        <QuorumPips reviews={entry.reviews} agree={entry.agree} />
      </Field>

      <Field label="Delta">
        <span className={cn('tnum font-mono text-xs', deltaTone(entry.delta))}>
          {entry.delta}
        </span>
      </Field>

      <Field label="Note">
        <span className="text-sm text-text-3">{entry.note}</span>
      </Field>
    </motion.div>
  );
}

/**
 * One field of a record. Below lg it carries its own mono micro-label so the
 * row reads as a labelled record rather than a table with the header missing.
 */
function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="cell"
      className={cn('flex items-baseline gap-4 lg:block', className)}
    >
      <span className="label w-[4.5rem] shrink-0 text-text-4 lg:hidden">
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * The consensus readout: one pip per review, agreeing pips filled. The ring is
 * always drawn — it is the count of reviewers that matters as much as the
 * count of agreements, and a hollow pip is the only way to show a dissent.
 */
function QuorumPips({ reviews, agree }: { reviews: number; agree: number }) {
  const reduced = usePrefersReducedMotion();

  return (
    <div
      className="flex items-center gap-2"
      role="img"
      aria-label={`${agree} of ${reviews} reviewers agreed`}
    >
      <div className="flex items-center gap-[3px]" aria-hidden>
        {Array.from({ length: reviews }, (_, i) => (
          <span
            key={i}
            className="grid size-2 shrink-0 place-items-center rounded-full border border-line-strong"
          >
            {i < agree && (
              <motion.span
                className="size-1 rounded-full bg-cyan shadow-[0_0_6px_rgba(110,231,245,0.9)]"
                initial={reduced ? false : { scale: 0, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                viewport={VIEWPORT}
                transition={{
                  duration: 0.4,
                  ease: EASE.settle,
                  delay: 0.2 + i * 0.07,
                }}
              />
            )}
          </span>
        ))}
      </div>
      <span className="tnum font-mono text-[0.625rem] text-text-3" aria-hidden>
        {agree}/{reviews}
      </span>
    </div>
  );
}

const deltaTone = (delta: string) =>
  delta.startsWith('+')
    ? 'text-cyan'
    : delta.startsWith('-')
      ? 'text-rose'
      : 'text-text-3';

/* ══════════════════════════════════════════════════════════════════════════
   LIVE ACTIVITY
   ══════════════════════════════════════════════════════════════════════════ */

const TICK_MS = 3200;

/**
 * The live feed.
 *
 * Auto-updating text that runs longer than five seconds needs a way to stop it
 * (WCAG 2.2.2), and this one would otherwise run for the life of the page. So
 * it stops three ways: under `prefers-reduced-motion` it never starts and rests
 * on the first entry, it holds while a pointer or the keyboard is inside the
 * panel, and the Live indicator is itself a pause toggle.
 *
 * All three gate whether the interval is *scheduled*, not just whether its
 * effect is visible — a component that re-renders every 3.2 seconds forever,
 * including while it is nowhere near the viewport, is its own defect.
 */
function ActivityTicker() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const reduced = usePrefersReducedMotion();

  const running = !reduced && !paused && !held;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(
      () => setIndex((n) => (n + 1) % ACTIVITY.length),
      TICK_MS,
    );
    return () => clearInterval(id);
  }, [running]);

  const item = ACTIVITY[index];
  const enter = reduced
    ? { opacity: 1 }
    : { opacity: 1, y: 0, filter: 'blur(0px)' };
  const hidden = reduced
    ? { opacity: 0 }
    : { opacity: 0, y: 10, filter: 'blur(5px)' };

  return (
    <div
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <GlassPanel className="p-5 sm:p-6">
        <div className="flex items-center justify-between gap-4">
          {reduced ? (
            <span className="flex items-center gap-2.5">
              <span aria-hidden className="size-2 rounded-full bg-cyan/80" />
              <span className="label text-text-2">Live</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-pressed={paused}
              aria-label={
                paused ? 'Resume the activity feed' : 'Pause the activity feed'
              }
              className="group -m-1 flex items-center gap-2.5 rounded-xs p-1"
            >
              {paused ? (
                <span
                  aria-hidden
                  className="size-2 rounded-full border border-line-strong bg-white/8"
                />
              ) : (
                <PulseDot />
              )}
              <span className="label text-text-2 transition-colors duration-fast group-hover:text-text-1">
                {paused ? 'Paused' : 'Live'}
              </span>
            </button>
          )}

          <span className="label tnum text-text-4">
            {String(index + 1).padStart(2, '0')} /{' '}
            {String(ACTIVITY.length).padStart(2, '0')}
          </span>
        </div>

        <div aria-hidden className="mt-5 h-px w-full bg-line" />

        {/* Fixed floor so the panel never resizes between entries.
            `relative` + absolutely-positioned children is what makes this a
            true crossfade: with AnimatePresence's default `mode="sync"` both
            entries are mounted at once and overlap. `mode="wait"` would run
            the exit to completion first, leaving the panel visibly empty for
            most of half a second on every tick. */}
        <div className="relative mt-5 min-h-[5.5rem]">
          <AnimatePresence initial={false}>
            <motion.p
              key={index}
              className="absolute inset-x-0 top-0 text-sm"
              initial={hidden}
              animate={enter}
              exit={hidden}
              transition={{ duration: reduced ? 0.2 : 0.45, ease: EASE.outExpo }}
            >
              <span className="text-text-1">{item.actor}</span>
              <span className="text-text-3"> · {item.region}</span>
              <br />
              <span className="text-text-2">{item.action} </span>
              <span className="text-blue-soft">{item.target}</span>
            </motion.p>
          </AnimatePresence>
        </div>
      </GlassPanel>
    </div>
  );
}
