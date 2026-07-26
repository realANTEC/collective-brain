'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight, CornerDownLeft, Search, Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';
import { HERO } from '@/lib/content';
import { scene, pulseScene } from '@/lib/scene-state';
import {
  isAnswerServiceConfigured,
  warmAnswerService,
} from '@/lib/answer-service';
import { usePrefersReducedMotion, useTypewriter } from '@/lib/hooks';
import { EASE, SPRING_MASS, SPRING_SNAP } from '@/lib/motion';

/** The traversal stages shown while an answer is being composed. */
const TRAVERSAL = [
  { label: 'Parsing query into claims', detail: '4 candidates' },
  { label: 'Traversing the Core', detail: '2,841 nodes / 6 domains' },
  { label: 'Weighting evidence', detail: '17 sources ranked' },
  { label: 'Composing answer', detail: 'dissent preserved' },
] as const;

/**
 * The search field.
 *
 * This is the product's centrepiece, so it carries more choreography than
 * anything else on the page:
 *
 *   idle      typewriter cycles example questions in the placeholder
 *   focus     page behind blurs through a masked scrim, the aurora ring lights,
 *             the WebGL core swells and brightens, suggestions drop in
 *   submit    a light wave fires through the graph, the traversal stages play,
 *             then the answer page takes over
 *
 * The scrim's blur is masked with a radial gradient so the centre of the
 * viewport — where the Knowledge Core sits — stays sharp. Blurring uniformly
 * would dim the very thing the interaction is meant to draw attention to.
 */
export function SearchField({
  className,
  onActiveChange,
}: {
  className?: string;
  /** Fires when the field takes or releases attention, so the surrounding
   *  layout can recede (dim + blur) while a question is being composed. */
  onActiveChange?: (active: boolean) => void;
}) {
  const router = useRouter();
  const reduced = usePrefersReducedMotion();

  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLFormElement>(null);

  const [focused, setFocused] = useState(false);
  const [value, setValue] = useState('');
  const [stage, setStage] = useState(-1);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  /** Space available below the field, measured when the panel opens. */
  const [panelMaxHeight, setPanelMaxHeight] = useState<number>();

  const submitting = stage >= 0;
  const typed = useTypewriter(HERO.searchPlaceholders, {
    active: !focused && value.length === 0 && !submitting,
  });

  /* -- Scene coupling ---------------------------------------------------- */

  useEffect(() => {
    const active = focused || submitting;
    scene.searchFocusTarget = active ? 1 : 0;
    onActiveChange?.(active);
    // Overlap the container's cold start with the time spent typing. The
    // service scales to zero, so this is usually the difference between an
    // answer in two seconds and one in forty.
    if (focused) warmAnswerService();
    return () => {
      scene.searchFocusTarget = 0;
    };
  }, [focused, submitting, onActiveChange]);

  /**
   * Measure the room below the field and cap the dropdown to it.
   *
   * The panel is `absolute top-full`, so with a hero-height field there is
   * often less space beneath it than the list needs — it then runs past the
   * fold and reads as though it has been sliced off. Measuring at open time
   * (rather than guessing with a fixed max-height) keeps the panel's bottom
   * edge, radius and shadow on screen at every viewport size.
   */
  useEffect(() => {
    if (!focused && !submitting) return;

    const measure = () => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      // visualViewport, not innerHeight: on a phone the on-screen keyboard
      // shrinks the visual viewport but leaves innerHeight untouched, so
      // measuring against innerHeight would size the panel to space that is
      // actually underneath the keyboard.
      const available =
        (window.visualViewport?.height ?? window.innerHeight) - rect.bottom - 40;
      setPanelMaxHeight(Math.max(150, available));
    };

    measure();
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('scroll', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
    };
  }, [focused, submitting]);

  /* -- "/" focuses the field, Escape releases it ------------------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if (e.key === '/' && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* -- Submit ------------------------------------------------------------ */

  // Timers are tracked so an unmount mid-sequence cannot call setState on a
  // dead component or navigate after the user has already left.
  const timers = useRef<number[]>([]);
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    },
    [],
  );

  const runQuery = useCallback(
    (query: string) => {
      if (!query.trim() || submitting) return;

      setValue(query);
      inputRef.current?.blur();
      pulseScene(1);

      // With a live endpoint the answer page owns the waiting: it can report
      // real progress and a real cold start, where this field can only mime it.
      // Staging a fabricated traversal in front of a request that is genuinely
      // running would add latency to tell the user something untrue.
      if (isAnswerServiceConfigured()) {
        router.push(`/answer?q=${encodeURIComponent(query)}`);
        return;
      }

      if (reduced) {
        router.push('/answer');
        return;
      }

      // Walk the traversal stages, firing a smaller wave at each one so the
      // core keeps reacting while the answer assembles.
      setStage(0);
      let i = 0;
      const advance = () => {
        i += 1;
        if (i < TRAVERSAL.length) {
          setStage(i);
          pulseScene(0.35);
          timers.current.push(window.setTimeout(advance, 460));
        } else {
          timers.current.push(
            window.setTimeout(() => router.push('/answer'), 420),
          );
        }
      };
      timers.current.push(window.setTimeout(advance, 520));
    },
    [router, submitting, reduced],
  );

  const suggestions = HERO.searchPlaceholders.filter((s) =>
    value.trim() ? s.toLowerCase().includes(value.trim().toLowerCase()) : true,
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!focused || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestion((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestion(
        (i) => (i - 1 + suggestions.length) % suggestions.length,
      );
    } else if (e.key === 'Enter' && activeSuggestion >= 0) {
      e.preventDefault();
      runQuery(suggestions[activeSuggestion]);
    }
  };

  /* No full-viewport scrim here by design.
        A `position: fixed` overlay rendered from inside the hero is not
        reliably viewport-sized: any ancestor carrying a transform or a filter
        (Framer leaves `filter: blur(0px)` behind after a blur-in entrance)
        becomes its containing block, and `inset-0` then resolves to that
        ancestor's box — producing a dark band across the search row instead of
        a page-wide dim. The surrounding layout recedes via `onActiveChange`
        instead, which also leaves the WebGL core untouched so it can brighten
        while the DOM behind it softens. */
  return (
    <div className={cn('relative z-40 w-full max-w-2xl', className)}>
        <motion.form
          ref={wrapRef}
          onSubmit={(e) => {
            e.preventDefault();
            runQuery(value || HERO.searchPlaceholders[0]);
          }}
          animate={
            reduced
              ? undefined
              : { scale: focused || submitting ? 1.022 : 1, y: focused ? -2 : 0 }
          }
          transition={SPRING_MASS}
          className="relative"
          role="search"
        >
          {/* Ambient bloom behind the field. */}
          <motion.span
            aria-hidden
            className="pointer-events-none absolute -inset-6 -z-10 rounded-full blur-2xl"
            animate={{ opacity: focused || submitting ? 1 : 0.35 }}
            transition={{ duration: 0.6, ease: EASE.outExpo }}
            style={{
              background:
                'radial-gradient(closest-side, rgba(61,107,255,0.3), rgba(138,107,255,0.14) 55%, transparent 78%)',
            }}
          />

          <div
            className={cn(
              'aurora-ring glass relative flex items-center gap-3 rounded-full',
              'h-14 pr-2 pl-5 sm:h-16 sm:pr-2.5 sm:pl-6',
              'transition-[border-color,background-color] duration-500',
              'ease-[cubic-bezier(0.16,1,0.3,1)]',
              (focused || submitting) && 'border-white/14',
            )}
            data-lit={focused || submitting}
          >
            <Search
              className={cn(
                'size-[18px] shrink-0 transition-colors duration-400',
                focused || submitting ? 'text-blue-soft' : 'text-text-3',
              )}
              strokeWidth={1.75}
              aria-hidden
            />

            <div className="relative min-w-0 flex-1">
              <input
                ref={inputRef}
                type="search"
                value={value}
                disabled={submitting}
                onChange={(e) => {
                  setValue(e.target.value);
                  setActiveSuggestion(-1);
                }}
                onFocus={() => setFocused(true)}
                // Delay the blur so a pointerdown on a suggestion still lands.
                onBlur={() => window.setTimeout(() => setFocused(false), 140)}
                onKeyDown={onKeyDown}
                placeholder=""
                aria-label="Ask the Collective Brain"
                autoComplete="off"
                spellCheck={false}
                className={cn(
                  'w-full bg-transparent text-[0.9375rem] text-text-1 sm:text-base',
                  'placeholder:text-text-3 [&::-webkit-search-cancel-button]:appearance-none',
                  // The global focus ring would draw a second rounded rect
                  // inside the pill. Focus is already unmistakable here — the
                  // aurora ring lights, the field scales and the page recedes —
                  // so the duplicate indicator is suppressed, not the state.
                  'focus-visible:outline-none',
                )}
              />

              {/* Typewriter placeholder. Sits behind the real input so the
                  caret and selection still behave natively. */}
              {!focused && !submitting && value.length === 0 && (
                <span
                  className="pointer-events-none absolute inset-y-0 left-0 flex items-center text-[0.9375rem] text-text-3 sm:text-base"
                  aria-hidden
                >
                  {typed}
                  {!reduced && (
                    <span className="animate-caret ml-px inline-block h-[1.05em] w-px translate-y-[0.08em] bg-blue-soft" />
                  )}
                </span>
              )}
            </div>

            {/* Keyboard hint, retired once the field is in use. */}
            <AnimatePresence>
              {!focused && !submitting && (
                <motion.kbd
                  className="hidden shrink-0 rounded-md border border-line-strong bg-white/4 px-1.5 py-0.5 font-mono text-[0.625rem] text-text-3 sm:block"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={SPRING_SNAP}
                >
                  /
                </motion.kbd>
              )}
            </AnimatePresence>

            <motion.button
              type="submit"
              disabled={submitting}
              aria-label="Ask"
              className={cn(
                'relative grid size-10 shrink-0 place-items-center rounded-full sm:size-11',
                'bg-text-1 text-void transition-shadow duration-500',
                'shadow-[0_6px_20px_-6px_rgba(61,107,255,0.5)]',
                'hover:shadow-[0_8px_30px_-6px_rgba(61,107,255,0.85)]',
                'disabled:opacity-70',
              )}
              whileTap={reduced ? undefined : { scale: 0.92 }}
              transition={SPRING_SNAP}
            >
              {submitting ? (
                <motion.span
                  className="size-3.5 rounded-full border-[1.5px] border-void/25 border-t-void"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                />
              ) : (
                <ArrowUpRight className="size-[18px]" strokeWidth={2} />
              )}
            </motion.button>
          </div>

          {/* Suggestions */}
          <AnimatePresence>
            {focused && !submitting && suggestions.length > 0 && (
              <motion.div
                // Opaque, not glass. A dropdown sits directly over body copy
                // and a telemetry bar; at 82% alpha both read straight through
                // it and the type becomes unreadable. Backdrop blur is layered
                // on top for depth, but legibility never depends on it.
                className={cn(
                  'absolute inset-x-0 top-full z-50 mt-3 flex flex-col overflow-hidden',
                  'rounded-xl border border-line-strong bg-surface-2/98 backdrop-blur-2xl',
                  'shadow-[0_28px_70px_-18px_rgba(0,0,0,0.9),inset_0_1px_0_0_rgb(255_255_255/0.06)]',
                )}
                style={{ maxHeight: panelMaxHeight }}
                initial={{ opacity: 0, y: -8, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -6, filter: 'blur(6px)' }}
                transition={{ duration: 0.28, ease: EASE.outExpo }}
              >
                <div className="flex shrink-0 items-center gap-2 px-4 pt-3.5 pb-2.5">
                  <Sparkles className="size-3 text-violet" strokeWidth={2} aria-hidden />
                  <span className="label">Asked recently by others</span>
                </div>

                {/* The list scrolls rather than overflowing the fold, and the
                    fade tells you there is more instead of looking severed. */}
                <ul
                  className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5 pt-0"
                  // A gentle fade over the last sliver only. The shared
                  // mask-fade-b starts at 55% and washes out rows that are
                  // fully in view, which reads as damage rather than as depth.
                  style={{
                    maskImage:
                      'linear-gradient(to bottom, #000 84%, transparent 100%)',
                  }}
                >
                  {suggestions.map((s, i) => (
                    <li key={s}>
                      <button
                        type="button"
                        onPointerDown={(e) => {
                          e.preventDefault();
                          runQuery(s);
                        }}
                        onPointerEnter={() => setActiveSuggestion(i)}
                        className={cn(
                          'group/sug flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2.5 text-left',
                          'transition-colors duration-200',
                          activeSuggestion === i
                            ? 'bg-white/6 text-text-1'
                            : 'text-text-2 hover:bg-white/4',
                        )}
                      >
                        <span className="truncate text-sm">{s}</span>
                        <CornerDownLeft
                          className={cn(
                            'size-3.5 shrink-0 transition-opacity duration-200',
                            activeSuggestion === i ? 'opacity-70' : 'opacity-0',
                          )}
                          strokeWidth={1.75}
                          aria-hidden
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Traversal readout */}
          <AnimatePresence>
            {submitting && (
              <motion.div
                className={cn(
                  'absolute inset-x-0 top-full z-50 mt-3 overflow-hidden rounded-xl px-4 py-4',
                  'border border-line-strong bg-surface-2/98 backdrop-blur-2xl',
                  'shadow-[0_28px_70px_-18px_rgba(0,0,0,0.9),inset_0_1px_0_0_rgb(255_255_255/0.06)]',
                )}
                initial={{ opacity: 0, y: -8, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3, ease: EASE.outExpo }}
                role="status"
                aria-live="polite"
              >
                <ul className="space-y-2.5">
                  {TRAVERSAL.map((step, i) => {
                    const done = i < stage;
                    const active = i === stage;
                    return (
                      <li
                        key={step.label}
                        className={cn(
                          'flex items-center gap-3 transition-opacity duration-300',
                          i > stage ? 'opacity-25' : 'opacity-100',
                        )}
                      >
                        <span
                          className={cn(
                            'size-1.5 shrink-0 rounded-full transition-colors duration-300',
                            done && 'bg-cyan',
                            active && 'bg-blue-soft shadow-[0_0_10px_rgba(110,144,255,0.9)]',
                            !done && !active && 'bg-white/15',
                          )}
                          aria-hidden
                        />
                        <span className="flex-1 text-xs text-text-1">
                          {step.label}
                        </span>
                        <span className="font-mono text-[0.625rem] text-text-3">
                          {step.detail}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-4 h-px w-full overflow-hidden bg-white/8">
                  <motion.div
                    className="h-full bg-gradient-to-r from-blue via-violet to-cyan"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: (stage + 1) / TRAVERSAL.length }}
                    style={{ transformOrigin: 'left' }}
                    transition={{ duration: 0.45, ease: EASE.outExpo }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.form>
      </div>
  );
}
