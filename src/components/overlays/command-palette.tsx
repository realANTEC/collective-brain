'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowUp,
  CornerDownLeft,
  FileText,
  Hash,
  Search,
  type LucideIcon,
} from 'lucide-react';

import { COMMANDS } from '@/lib/content';
import { EASE, SPRING_SNAP, panelIn, pickVariants } from '@/lib/motion';
import { useDismiss, useHotkey, usePrefersReducedMotion, useScrollLock } from '@/lib/hooks';
import { scrollTo } from '@/components/providers/smooth-scroll';
import { cn } from '@/lib/utils';

type Command = (typeof COMMANDS)[number];

const OPEN_EVENT = 'cb:open-palette';

const HINT_ICONS: Record<string, LucideIcon> = {
  Section: Hash,
  Page: FileText,
  Navigation: ArrowUp,
};

/** Tab order inside the panel. Rows are driven by ArrowUp/Down and
 *  `aria-activedescendant`, so they are deliberately not tab stops. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Exact prefix beats a mid-string hit; among mid-string hits, earlier wins. */
function score(command: Command, query: string) {
  const at = command.label.toLowerCase().indexOf(query);
  return at === 0 ? -1 : at;
}

/**
 * Command palette.
 *
 * Sits at 18vh rather than the vertical centre — a centred box reads as a
 * modal asking a question, a box hung near the top reads as a command bar the
 * product has always had. The highlight is a single shared-layout element that
 * physically slides between rows instead of a class toggling on each one; that
 * continuity is what makes arrow-key navigation feel like moving one object
 * rather than lighting up six.
 */
export function CommandPalette() {
  const router = useRouter();
  const reduced = usePrefersReducedMotion();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowsRef = useRef<Array<HTMLLIElement | null>>([]);

  const results = useMemo<readonly Command[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter((c) => c.label.toLowerCase().includes(q)).sort(
      (a, b) => score(a, q) - score(b, q),
    );
  }, [query]);

  const close = useCallback(() => setOpen(false), []);

  useHotkey(
    (e) => (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k',
    (e) => {
      e.preventDefault();
      setOpen((o) => !o);
    },
  );

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  // The whole open lifecycle: reset, take focus, hold it, hand it back.
  //
  // `aria-modal` is a promise about focus, not just a label — so the two
  // behaviours it implies are implemented here rather than assumed. Without the
  // trap, Tab walks out of the panel into nav links sitting behind a scrim that
  // still reads as modal; without the restore, the focused element unmounts on
  // close and focus falls to <body>, dropping a keyboard user back at the top
  // of the tab order.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);

    // Captured before we move focus, so this is the element that opened us.
    const opener = document.activeElement as HTMLElement | null;

    const onTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;

      const stops = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = stops[0];
      const last = stops[stops.length - 1];
      if (!first || !last) return;

      // Focus that has already escaped — or never arrived — is pulled back in.
      if (!panel.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onTab);

    // Focus after the panel has been committed, so the browser does not try to
    // scroll an element that is still mid-transform into view.
    const id = window.setTimeout(() => inputRef.current?.focus(), 40);

    return () => {
      window.clearTimeout(id);
      document.removeEventListener('keydown', onTab);
      // `preventScroll` matters: a command that scrolls to a section hands the
      // page to Lenis a tick later, and a focus-driven jump would fight it.
      if (opener && opener !== document.body && opener.isConnected) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [open]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    rowsRef.current[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, results]);

  useScrollLock(open);
  useDismiss(panelRef, close, open);

  const activate = useCallback(
    (command: Command) => {
      setOpen(false);
      if (command.target.startsWith('#')) {
        // useScrollLock restores body overflow in its cleanup; scrolling before
        // that lands would be swallowed, so hand Lenis the target a tick later.
        window.setTimeout(() => scrollTo(command.target), 90);
        return;
      }
      router.push(command.target);
    },
    [router],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const command = results[active];
      if (command) activate(command);
    }
  };

  const activeCommand = results[active];

  return (
    <AnimatePresence>
      {open && (
        <motion.div key="cb-palette" className="fixed inset-0 z-[150]">
          <motion.div
            aria-hidden
            className="absolute inset-0 bg-void/72 backdrop-blur-[10px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE.outExpo }}
          />

          <div className="absolute inset-x-0 top-[16vh] flex justify-center px-5 sm:top-[18vh] sm:px-8">
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label="Command palette"
              className="relative w-full max-w-xl"
              variants={pickVariants(reduced, panelIn)}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute -inset-8 -z-10 blur-2xl"
                style={{
                  background:
                    'radial-gradient(closest-side, rgba(61,107,255,0.22), transparent 72%)',
                }}
              />

              <div className="glass-deep overflow-hidden rounded-xl">
                <div className="flex items-center gap-3 border-b border-line px-4 py-3.5 sm:px-5">
                  <Search
                    className="size-4 shrink-0 text-text-3"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <input
                    ref={inputRef}
                    type="text"
                    role="combobox"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Search commands"
                    aria-label="Search commands"
                    aria-expanded={results.length > 0}
                    aria-controls="cb-command-list"
                    aria-activedescendant={
                      activeCommand ? `cb-command-${activeCommand.id}` : undefined
                    }
                    autoComplete="off"
                    spellCheck={false}
                    className="min-w-0 flex-1 bg-transparent text-sm text-text-1 placeholder:text-text-3"
                  />
                  <kbd className="grid h-[18px] shrink-0 place-items-center rounded border border-line-strong bg-white/4 px-1.5 font-mono text-[0.625rem] text-text-3">
                    esc
                  </kbd>
                </div>

                <ul
                  id="cb-command-list"
                  role="listbox"
                  aria-label="Commands"
                  className="max-h-[46vh] overflow-y-auto p-1.5"
                >
                  {results.map((command, i) => {
                    const Icon = HINT_ICONS[command.hint] ?? Hash;
                    const isActive = i === active;

                    return (
                      <li
                        key={command.id}
                        id={`cb-command-${command.id}`}
                        role="option"
                        aria-selected={isActive}
                        data-cursor="hover"
                        ref={(el) => {
                          rowsRef.current[i] = el;
                        }}
                        onClick={() => activate(command)}
                        onPointerEnter={() => setActive(i)}
                        className="relative flex cursor-pointer items-center gap-3.5 rounded-lg px-3 py-2.5"
                      >
                        {isActive && (
                          <motion.span
                            layoutId="cb-command-highlight"
                            aria-hidden
                            className="absolute inset-0 rounded-lg bg-white/6 ring-1 ring-white/8 ring-inset"
                            transition={reduced ? { duration: 0 } : SPRING_SNAP}
                          />
                        )}

                        <Icon
                          className={cn(
                            'relative size-3.5 shrink-0 transition-colors duration-200',
                            isActive ? 'text-blue-soft' : 'text-text-4',
                          )}
                          strokeWidth={1.75}
                          aria-hidden
                        />

                        <span
                          className={cn(
                            'relative min-w-0 flex-1 truncate text-sm transition-colors duration-200',
                            isActive ? 'text-text-1' : 'text-text-2',
                          )}
                        >
                          {command.label}
                        </span>

                        <span
                          className={cn(
                            'relative shrink-0 rounded border px-1.5 py-0.5',
                            'font-mono text-[0.625rem] tracking-[0.14em] uppercase',
                            'transition-colors duration-200',
                            isActive
                              ? 'border-line-strong text-text-2'
                              : 'border-line text-text-4',
                          )}
                        >
                          {command.hint}
                        </span>

                        <CornerDownLeft
                          className={cn(
                            'relative size-3.5 shrink-0 text-text-3 transition-opacity duration-200',
                            isActive ? 'opacity-70' : 'opacity-0',
                          )}
                          strokeWidth={1.75}
                          aria-hidden
                        />
                      </li>
                    );
                  })}

                  {results.length === 0 && (
                    <li role="presentation" className="px-3 py-9 text-center">
                      <span className="label">No command matches</span>
                    </li>
                  )}
                </ul>

                <div className="flex items-center justify-between gap-4 border-t border-line px-4 py-2.5 sm:px-5">
                  <div className="flex items-center gap-4">
                    <KeyHint keys={['↑', '↓']}>navigate</KeyHint>
                    <KeyHint keys={['↵']}>select</KeyHint>
                    <KeyHint keys={['esc']}>close</KeyHint>
                  </div>
                  <span className="label tnum hidden text-text-4 sm:block">
                    {results.length} / {COMMANDS.length}
                  </span>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function KeyHint({ keys, children }: { keys: string[]; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      {keys.map((key) => (
        <kbd
          key={key}
          className="grid h-[18px] min-w-[18px] place-items-center rounded border border-line-strong bg-white/4 px-1 font-mono text-[0.625rem] leading-none text-text-3"
        >
          {key}
        </kbd>
      ))}
      <span className="label text-[0.5625rem] text-text-4">{children}</span>
    </span>
  );
}
