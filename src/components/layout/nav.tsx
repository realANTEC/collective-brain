'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  AnimatePresence,
  motion,
  useAnimationFrame,
  type Variants,
} from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';

import { Button } from '@/components/ui';
import { scrollTo } from '@/components/providers/smooth-scroll';
import { NAV_LINKS, SECTIONS, SITE } from '@/lib/content';
import { EASE, SPRING_SNAP, pickVariants, stagger } from '@/lib/motion';
import {
  useHotkey,
  useMagnetic,
  useMediaQuery,
  usePrefersReducedMotion,
  useSceneSnapshot,
  useScrollLock,
} from '@/lib/hooks';
import { cn, damp } from '@/lib/utils';

/** Scroll depth at which the bar stops being a floating overlay. */
const BAR_THRESHOLD = 80;

/** NAV_LINKS carry no index of their own — they borrow the section register's. */
const SECTION_BY_HREF = new Map(
  SECTIONS.map(
    (section, i) => [`#${section.id}`, { ...section, order: i }] as const,
  ),
);

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Tabbable descendants in DOM order. Breakpoint-hidden controls (`hidden
 * lg:block`) are still in the markup but have no boxes, so client rects — not
 * the class list — decide what is actually reachable at this viewport.
 */
function focusableWithin(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0,
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   NAV
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Site chrome.
 *
 * The bar itself is two stacked layers: a background plate that fades, blurs
 * and drops into place past the fold, and the content row which never moves.
 * Animating one element's background *and* its children in a single pass is
 * what produces the jelly-like re-layout you see on most sticky headers.
 */
export function Nav() {
  const { section } = useSceneSnapshot();
  const reduced = usePrefersReducedMotion();
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const [past, setPast] = useState(false);
  const [open, setOpen] = useState(false);
  const [logoHot, setLogoHot] = useState(false);

  const headerRef = useRef<HTMLElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useScrollLock(open);
  useHotkey(
    (e) => e.key === 'Escape',
    () => setOpen(false),
  );

  useEffect(() => {
    const onScroll = () => setPast(window.scrollY > BAR_THRESHOLD);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Crossing into desktop layout while the sheet is open would strand the lock.
  useEffect(() => {
    if (isDesktop) setOpen(false);
  }, [isDesktop]);

  const openPalette = useCallback(() => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent('cb:open-palette'));
  }, []);

  /**
   * In-page navigation. Lenis moves the document, so the scroll lock has to be
   * released before it can — hence the two-frame wait when the sheet is open:
   * one frame for React to flush the effect cleanup, one for the style to land.
   */
  const go = useCallback(
    (href: string) => {
      const anchor = href.startsWith('#') && href.length > 1;
      if (!open) {
        if (anchor) scrollTo(href);
        return;
      }
      setOpen(false);
      if (!anchor) return;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => scrollTo(href)),
      );
    },
    [open],
  );

  /**
   * Focus containment while the sheet is up.
   *
   * The sheet covers `<main>` entirely, but the header stays *above* it and
   * carries the close control — so the keyboard boundary is header + sheet:
   * everything the reader can see, and nothing behind. Left alone, Tab walks
   * out of the last sheet row into the ScrollRail and then through every link
   * in the page underneath, all of it invisible.
   */
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const ring = [
        ...focusableWithin(headerRef.current),
        ...focusableWithin(sheetRef.current),
      ];
      if (ring.length === 0) return;

      const first = ring[0];
      const last = ring[ring.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside =
        !!active &&
        (!!headerRef.current?.contains(active) ||
          !!sheetRef.current?.contains(active));

      // Only the two seams are intercepted; everything between them keeps the
      // browser's own ordering, including the sheet's tabIndex={-1} panel.
      if (!inside) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus({ preventScroll: true });
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open]);

  /**
   * Focus returns to the trigger on close — but not on first mount, and not
   * when the desktop breakpoint closed the sheet, since the hamburger is
   * `lg:hidden` up there and focusing a display:none element drops focus to
   * `<body>` instead. `preventScroll` keeps the restore from fighting Lenis.
   */
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;

    // AnimatePresence keeps the panel mounted for its exit tween; neutralise it
    // for that window so a fast Tab cannot catch a row on its way out. The next
    // opening mounts a fresh node, so the attribute never has to be cleared.
    sheetRef.current?.setAttribute('inert', '');

    const trigger = triggerRef.current;
    if (trigger && trigger.getClientRects().length > 0) {
      trigger.focus({ preventScroll: true });
    }
  }, [open]);

  const plated = past && !open;

  return (
    <>
      {/* z-30 keeps the chrome above <main> (z-10) while leaving the z-40+ band
          free for the true overlays — palette, cursor, preloader. */}
      <header ref={headerRef} className="fixed inset-x-0 top-0 z-30">
        {/* Safari below 18 ignores the unprefixed inline backdrop-filter and
            keeps the class's -webkit- value at full strength — harmless, since
            opacity 0 nulls a backdrop filter entirely. */}
        <motion.div
          aria-hidden
          className="glass-deep absolute inset-0 border-x-0 border-t-0 border-b border-line"
          initial={false}
          animate={{
            opacity: plated ? 1 : 0,
            y: plated ? 0 : -10,
            backdropFilter: plated
              ? 'blur(28px) saturate(160%)'
              : 'blur(0px) saturate(100%)',
          }}
          transition={{ duration: reduced ? 0.15 : 0.6, ease: EASE.outExpo }}
        />

        <nav
          aria-label="Primary"
          className={cn(
            'gutter relative flex items-center justify-between gap-6',
            'transition-[height] duration-500 ease-out-expo',
            past ? 'h-16' : 'h-[4.5rem] lg:h-20',
          )}
        >
          {/* ── Brand ─────────────────────────────────────────────────── */}
          <a
            href="#hero"
            onClick={(e) => {
              e.preventDefault();
              go('#hero');
            }}
            onPointerEnter={() => setLogoHot(true)}
            onPointerLeave={() => setLogoHot(false)}
            onFocus={() => setLogoHot(true)}
            onBlur={() => setLogoHot(false)}
            aria-label={`${SITE.name} — back to top`}
            className="group relative z-10 flex shrink-0 items-center gap-2.5"
          >
            <Logomark hot={logoHot} />
            <span className="font-sans text-[0.9375rem] font-medium tracking-tight text-text-1">
              {SITE.name}
            </span>
          </a>

          {/* ── Sections ──────────────────────────────────────────────── */}
          <ul className="absolute top-1/2 left-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center lg:flex">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.href}
                href={link.href}
                label={link.label}
                active={SECTION_BY_HREF.get(link.href)?.order === section}
                onSelect={go}
              />
            ))}
          </ul>

          {/* ── Controls ──────────────────────────────────────────────── */}
          <div className="relative z-10 flex shrink-0 items-center gap-3 sm:gap-4">
            <a
              href="#pricing"
              onClick={(e) => {
                e.preventDefault();
                go('#pricing');
              }}
              className="group relative hidden text-sm text-text-2 transition-colors duration-300 hover:text-text-1 lg:block"
            >
              Sign in
              <span
                aria-hidden
                className="absolute -bottom-1 left-0 h-px w-full origin-left scale-x-0 bg-current transition-transform duration-500 ease-out-expo group-hover:scale-x-100"
              />
            </a>

            <PaletteTrigger onOpen={openPalette} />

            <span className="hidden lg:block">
              <Button
                variant="primary"
                size="sm"
                onClick={() => go('#cta')}
              >
                Enter the Core
              </Button>
            </span>

            <Hamburger
              buttonRef={triggerRef}
              open={open}
              onToggle={() => setOpen((v) => !v)}
            />
          </div>
        </nav>
      </header>

      <AnimatePresence>
        {open && (
          <MobileSheet
            key="sheet"
            panelRef={sheetRef}
            reduced={reduced}
            onSelect={go}
            onPalette={openPalette}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   LOGOMARK
   ══════════════════════════════════════════════════════════════════════════ */

/* Ring geometry, resolved once at module scope. Six nodes joined to every
   second node draw two interlocking triangles rather than a hexagon — the
   difference is what still reads as a *graph* at twenty pixels. */
const LOGO_R = 6.9;
const LOGO_NODES = Array.from({ length: 6 }, (_, i) => {
  const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
  return { x: 10 + Math.cos(a) * LOGO_R, y: 10 + Math.sin(a) * LOGO_R };
});
const LOGO_CHORDS = LOGO_NODES.map((_, i) => [i, (i + 2) % 6] as const);
const LOGO_CIRCUM = 2 * Math.PI * LOGO_R;
const LOGO_TRAIL = 5.4;

const PULSE_IDLE = 52; // deg/s
const PULSE_HOT = 210;

function Logomark({ hot }: { hot: boolean }) {
  const reduced = usePrefersReducedMotion();
  const pulseRef = useRef<SVGGElement>(null);
  const angle = useRef(0);
  const speed = useRef(PULSE_IDLE);

  /* The hover response eases angular *velocity*, not angle. Retargeting the
     angle would teleport the pulse; ramping the speed makes it accelerate. */
  useAnimationFrame((_, delta) => {
    const g = pulseRef.current;
    if (!g || reduced) return;
    const dt = Math.min(delta, 64) / 1000;
    speed.current = damp(speed.current, hot ? PULSE_HOT : PULSE_IDLE, 6, dt);
    angle.current = (angle.current + speed.current * dt) % 360;
    g.style.transform = `rotate(${angle.current.toFixed(2)}deg)`;
  });

  return (
    <svg
      viewBox="0 0 20 20"
      className="size-5 shrink-0"
      aria-hidden
      focusable="false"
    >
      <defs>
        <radialGradient id="cb-logo-glow">
          <stop offset="0%" stopColor="var(--color-cyan)" stopOpacity="0.85" />
          <stop offset="100%" stopColor="var(--color-cyan)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* transform-box: view-box makes 50% resolve to the viewBox centre —
          without it an SVG group rotates about its own bounding box. */}
      <g
        className={cn(!reduced && 'animate-orbit')}
        style={{ transformBox: 'view-box', transformOrigin: '50% 50%' }}
      >
        <circle
          cx="10"
          cy="10"
          r={LOGO_R}
          fill="none"
          className="stroke-white/10"
          strokeWidth="0.5"
        />
        {LOGO_CHORDS.map(([a, b]) => (
          <line
            key={`${a}-${b}`}
            x1={LOGO_NODES[a].x}
            y1={LOGO_NODES[a].y}
            x2={LOGO_NODES[b].x}
            y2={LOGO_NODES[b].y}
            className="stroke-white/18"
            strokeWidth="0.5"
          />
        ))}
        {LOGO_NODES.map((n, i) => (
          <circle
            key={i}
            cx={n.x}
            cy={n.y}
            r={i === 0 ? 1.1 : 0.85}
            className={i === 0 ? 'fill-blue-soft' : 'fill-white/55'}
          />
        ))}
      </g>

      <g
        ref={pulseRef}
        style={{ transformBox: 'view-box', transformOrigin: '50% 50%' }}
      >
        {/* A single dashed segment on the orbit track becomes the comet tail;
            the offset drags it behind the head instead of ahead of it. */}
        <circle
          cx="10"
          cy="10"
          r={LOGO_R}
          fill="none"
          stroke="var(--color-cyan)"
          strokeOpacity="0.5"
          strokeWidth="0.7"
          strokeLinecap="round"
          strokeDasharray={`${LOGO_TRAIL} ${LOGO_CIRCUM}`}
          strokeDashoffset={LOGO_TRAIL}
        />
        <circle cx={10 + LOGO_R} cy="10" r="2.7" fill="url(#cb-logo-glow)" />
        <circle cx={10 + LOGO_R} cy="10" r="0.95" className="fill-cyan" />
      </g>

      <circle cx="10" cy="10" r="1.15" className="fill-white/85" />
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PIECES
   ══════════════════════════════════════════════════════════════════════════ */

function NavLink({
  href,
  label,
  active,
  onSelect,
}: {
  href: string;
  label: string;
  active: boolean;
  onSelect: (href: string) => void;
}) {
  const magnet = useMagnetic<HTMLSpanElement>(0.2, 56);

  return (
    <li>
      <span ref={magnet} className="block">
        <a
          href={href}
          onClick={(e) => {
            e.preventDefault();
            onSelect(href);
          }}
          aria-current={active ? 'location' : undefined}
          className={cn(
            'group relative block px-4 py-2 text-sm transition-colors duration-300',
            active ? 'text-text-1' : 'text-text-2 hover:text-text-1',
          )}
        >
          {label}
          <span
            aria-hidden
            className={cn(
              'absolute bottom-1 left-4 h-px w-[calc(100%-2rem)] origin-left',
              'scale-x-0 bg-current transition-transform duration-500',
              'ease-out-expo group-hover:scale-x-100',
            )}
          />
          {active && (
            <motion.span
              layoutId="cb-nav-marker"
              aria-hidden
              className="absolute inset-x-0 -bottom-1 mx-auto size-1 rounded-full bg-blue-soft shadow-[0_0_9px_rgba(110,144,255,0.9)]"
              transition={SPRING_SNAP}
            />
          )}
        </a>
      </span>
    </li>
  );
}

function PaletteTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open the command palette"
      aria-keyshortcuts="Meta+K Control+K"
      className={cn(
        'group hidden h-8 items-center gap-1 rounded-full border border-line px-2',
        'transition-colors duration-300 hover:border-line-strong sm:inline-flex',
      )}
    >
      {['⌘', 'K'].map((key) => (
        <kbd
          key={key}
          className={cn(
            'grid size-5 place-items-center rounded-[5px] bg-white/5 font-mono',
            'text-[0.625rem] leading-none text-text-3',
            'transition-colors duration-300 group-hover:bg-white/9 group-hover:text-text-1',
          )}
        >
          {key}
        </kbd>
      ))}
    </button>
  );
}

function Hamburger({
  open,
  onToggle,
  buttonRef,
}: {
  open: boolean;
  onToggle: () => void;
  buttonRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onToggle}
      aria-label={open ? 'Close menu' : 'Open menu'}
      aria-expanded={open}
      aria-controls="cb-mobile-menu"
      className={cn(
        'relative grid size-10 shrink-0 place-items-center rounded-full border border-line',
        'transition-colors duration-300 hover:border-line-strong lg:hidden',
      )}
    >
      <span className="relative block h-[11px] w-[18px]">
        {[0, 1].map((i) => (
          <motion.span
            key={i}
            className="absolute left-0 h-px w-full origin-center bg-text-1"
            style={i === 0 ? { top: 0 } : { bottom: 0 }}
            animate={{
              y: open ? (i === 0 ? 5 : -5) : 0,
              rotate: open ? (i === 0 ? 45 : -45) : 0,
            }}
            transition={SPRING_SNAP}
          />
        ))}
      </span>
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MOBILE SHEET
   ══════════════════════════════════════════════════════════════════════════ */

/* The row carries opacity only; the clipped line inside carries the movement.
   Animating both would read as two separate arrivals of the same word. */
const sheetRow: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.5, ease: EASE.outExpo } },
};

const sheetLine: Variants = {
  hidden: { y: '110%', opacity: 0 },
  visible: {
    y: '0%',
    opacity: 1,
    transition: { duration: 0.85, ease: EASE.outExpo },
  },
};

function MobileSheet({
  panelRef,
  reduced,
  onSelect,
  onPalette,
}: {
  panelRef: RefObject<HTMLDivElement | null>;
  reduced: boolean;
  onSelect: (href: string) => void;
  onPalette: () => void;
}) {
  /* Focus lands on the panel itself rather than the first row: a screen reader
     announces the menu before its first item, and Tab still steps onto that
     item next because the panel precedes it in the DOM. Mount-only — the sheet
     is unmounted between openings by AnimatePresence. */
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
  }, [panelRef]);

  return (
    <motion.div
      ref={panelRef}
      id="cb-mobile-menu"
      tabIndex={-1}
      // A full-screen menu needs a near-opaque ground, not a glass pane. The
      // standard glass tint lets the hero's display type and search field read
      // straight through the links behind it, which makes both unreadable.
      className="fixed inset-0 z-20 rounded-none border-0 bg-void/95 backdrop-blur-2xl backdrop-saturate-150 focus-visible:outline-none lg:hidden"
      initial={{ opacity: 0, y: -14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: reduced ? 0.15 : 0.44, ease: EASE.outExpo }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(78% 46% at 12% 100%, rgba(61,107,255,0.16), transparent 70%)',
        }}
      />

      <div className="gutter relative flex h-full flex-col overflow-y-auto pt-24 pb-10">
        <motion.ul
          className="border-t border-line"
          variants={stagger(0.07, 0.1)}
          initial="hidden"
          animate="visible"
          exit="hidden"
        >
          {NAV_LINKS.map((link) => {
            const entry = SECTION_BY_HREF.get(link.href);
            return (
              <motion.li
                key={link.href}
                className="border-b border-line"
                variants={sheetRow}
              >
                <a
                  href={link.href}
                  onClick={(e) => {
                    e.preventDefault();
                    onSelect(link.href);
                  }}
                  className="group flex items-baseline gap-5 py-5"
                >
                  <span className="label tnum w-5 shrink-0 text-blue-soft/70">
                    {entry?.index ?? '—'}
                  </span>
                  <span className="block flex-1 overflow-hidden pb-[0.12em]">
                    <motion.span
                      className="block text-h3 font-medium text-lume"
                      variants={pickVariants(reduced, sheetLine)}
                    >
                      {link.label}
                    </motion.span>
                  </span>
                  <ArrowUpRight
                    className="size-4 shrink-0 self-center text-text-3 transition-all duration-500 ease-out-expo group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-blue-soft"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                </a>
              </motion.li>
            );
          })}
        </motion.ul>

        <motion.div
          className="mt-auto pt-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: reduced ? 0.15 : 0.7,
            delay: reduced ? 0 : 0.32,
            ease: EASE.outExpo,
          }}
        >
          <p className="label mb-5">Begin</p>
          <Button variant="primary" size="lg" onClick={() => onSelect('#cta')}>
            Enter the Core
          </Button>

          <div className="mt-8 flex items-center justify-between border-t border-line pt-6">
            <a
              href="#pricing"
              onClick={(e) => {
                e.preventDefault();
                onSelect('#pricing');
              }}
              className="text-sm text-text-2 transition-colors duration-300 hover:text-text-1"
            >
              Sign in
            </a>
            <button
              type="button"
              onClick={onPalette}
              className="label transition-colors duration-300 hover:text-text-1"
            >
              Commands ⌘K
            </button>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
