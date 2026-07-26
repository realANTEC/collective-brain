'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import {
  getSceneServerSnapshot,
  getSceneSnapshot,
  scene,
  subscribeScene,
  type QualityTier,
} from '@/lib/scene-state';
import { clamp, damp } from '@/lib/utils';

/* ══════════════════════════════════════════════════════════════════════════
   ENVIRONMENT
   ══════════════════════════════════════════════════════════════════════════ */

/** SSR-safe media query subscription. */
export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (typeof window === 'undefined') return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const usePrefersReducedMotion = () =>
  useMediaQuery('(prefers-reduced-motion: reduce)');

/** True on devices with a real hovering pointer — gates cursor & tilt effects. */
export const useHasPointer = () =>
  useMediaQuery('(hover: hover) and (pointer: fine)');

export const useIsMobile = () => useMediaQuery('(max-width: 767px)');
export const useIsTablet = () =>
  useMediaQuery('(min-width: 768px) and (max-width: 1279px)');

/** Discrete scene values that DOM components may re-render on. */
export function useSceneSnapshot() {
  return useSyncExternalStore(
    subscribeScene,
    getSceneSnapshot,
    getSceneServerSnapshot,
  );
}

/**
 * Resolve a rendering quality tier once on mount.
 *
 * We combine three cheap signals — logical core count, device memory, and
 * whether the pointer is coarse (a proxy for "phone GPU") — rather than
 * sniffing user agents. The 3D scene reads scene.quality every frame, so a
 * later downgrade from the fps watchdog takes effect without a remount.
 */
export function useDeviceTier(): QualityTier {
  const [tier, setTier] = useState<QualityTier>('high');

  useEffect(() => {
    const nav = navigator as Navigator & {
      deviceMemory?: number;
      hardwareConcurrency?: number;
    };
    const cores = nav.hardwareConcurrency ?? 4;
    const memory = nav.deviceMemory ?? 4;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const smallViewport = window.innerWidth < 768;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let resolved: QualityTier = 'high';
    if (reduced || cores <= 4 || memory <= 4 || (coarse && smallViewport)) {
      resolved = 'medium';
    }
    if (cores <= 2 || memory <= 2) resolved = 'low';

    // A WebGL context that reports a software renderer never gets the good stuff.
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      if (!gl) resolved = 'low';
      else {
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        const renderer = dbg
          ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
          : '';
        if (/swiftshader|llvmpipe|software/i.test(renderer)) resolved = 'low';
      }
    } catch {
      resolved = 'low';
    }

    // QA override. Rendering tiers are otherwise impossible to inspect on a
    // given machine — you get whatever your GPU earns you — which makes the
    // high-detail path untestable on software renderers and in CI.
    // `?quality=high|medium|low` pins it.
    const forced = new URLSearchParams(window.location.search).get('quality');
    if (forced === 'high' || forced === 'medium' || forced === 'low') {
      resolved = forced;
    }

    scene.quality = resolved;
    scene.reducedMotion = reduced;
    setTier(resolved);
  }, []);

  return tier;
}

/* ══════════════════════════════════════════════════════════════════════════
   POINTER-DRIVEN MICRO-INTERACTIONS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Magnetic attraction. The element leans toward the pointer while it is inside
 * an invasion radius, then springs home. Uses rAF + direct transform writes
 * rather than React state so it stays off the reconciler entirely.
 */
export function useMagnetic<T extends HTMLElement>(
  strength = 0.32,
  radius = 90,
) {
  const ref = useRef<T | null>(null);
  const enabled = useHasPointer();
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || reduced) return;

    let raf = 0;
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    let last = performance.now();
    let running = false;

    const tick = (now: number) => {
      const dt = Math.min(0.064, (now - last) / 1000);
      last = now;
      cx = damp(cx, tx, 12, dt);
      cy = damp(cy, ty, 12, dt);
      el.style.transform = `translate3d(${cx.toFixed(2)}px, ${cy.toFixed(2)}px, 0)`;

      if (Math.abs(cx - tx) > 0.05 || Math.abs(cy - ty) > 0.05) {
        raf = requestAnimationFrame(tick);
      } else {
        el.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
        running = false;
      }
    };

    const start = () => {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const dist = Math.hypot(dx, dy);
      const reach = Math.max(r.width, r.height) / 2 + radius;

      if (dist < reach) {
        const falloff = 1 - dist / reach;
        tx = dx * strength * falloff;
        ty = dy * strength * falloff;
      } else {
        tx = 0;
        ty = 0;
      }
      start();
    };

    const onLeave = () => {
      tx = 0;
      ty = 0;
      start();
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerleave', onLeave, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(raf);
    };
  }, [strength, radius, enabled, reduced]);

  return ref;
}

/**
 * 3D tilt on hover with a cursor-tracked specular highlight.
 *
 * Writes CSS custom properties (--rx, --ry, --mx, --my) instead of inline
 * transforms so the consuming component decides how to spend them — some tilt,
 * some only move the highlight.
 */
export function useTilt<T extends HTMLElement>(max = 7) {
  const ref = useRef<T | null>(null);
  const enabled = useHasPointer();
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!enabled || reduced) {
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
      return;
    }

    let raf = 0;
    let targetRx = 0;
    let targetRy = 0;
    let rx = 0;
    let ry = 0;
    let last = performance.now();
    let running = false;

    const tick = (now: number) => {
      const dt = Math.min(0.064, (now - last) / 1000);
      last = now;
      rx = damp(rx, targetRx, 14, dt);
      ry = damp(ry, targetRy, 14, dt);
      el.style.setProperty('--rx', `${rx.toFixed(3)}deg`);
      el.style.setProperty('--ry', `${ry.toFixed(3)}deg`);

      if (Math.abs(rx - targetRx) > 0.01 || Math.abs(ry - targetRy) > 0.01) {
        raf = requestAnimationFrame(tick);
      } else {
        running = false;
      }
    };

    const start = () => {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      targetRy = (px - 0.5) * 2 * max;
      targetRx = -(py - 0.5) * 2 * max;
      el.style.setProperty('--mx', `${(px * 100).toFixed(2)}%`);
      el.style.setProperty('--my', `${(py * 100).toFixed(2)}%`);
      start();
    };

    const onLeave = () => {
      targetRx = 0;
      targetRy = 0;
      start();
    };

    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerleave', onLeave, { passive: true });
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(raf);
    };
  }, [max, enabled, reduced]);

  return ref;
}

/** Cursor-tracked specular only — no tilt. Cheap enough for long lists. */
export function useSpecular<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${(((e.clientX - r.left) / r.width) * 100).toFixed(2)}%`);
      el.style.setProperty('--my', `${(((e.clientY - r.top) / r.height) * 100).toFixed(2)}%`);
    };
    el.addEventListener('pointermove', onMove, { passive: true });
    return () => el.removeEventListener('pointermove', onMove);
  }, []);

  return ref;
}

/* ══════════════════════════════════════════════════════════════════════════
   CONTENT ANIMATION
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Typewriter that cycles a list of phrases: types, holds, deletes, advances.
 * Pauses entirely while `active` is false so the hero field stops "talking"
 * the moment a user focuses it.
 */
export function useTypewriter(
  phrases: readonly string[],
  {
    typeSpeed = 46,
    deleteSpeed = 22,
    hold = 1900,
    active = true,
  }: {
    typeSpeed?: number;
    deleteSpeed?: number;
    hold?: number;
    active?: boolean;
  } = {},
) {
  const [text, setText] = useState('');
  const [phraseIndex, setPhraseIndex] = useState(0);
  const deletingRef = useRef(false);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (!active || reduced || phrases.length === 0) return;
    const phrase = phrases[phraseIndex % phrases.length];
    let timeout: ReturnType<typeof setTimeout>;

    if (!deletingRef.current) {
      if (text.length < phrase.length) {
        timeout = setTimeout(
          () => setText(phrase.slice(0, text.length + 1)),
          // Vary the cadence slightly so it reads as a human at a keyboard
          // rather than a metronome.
          typeSpeed + (text.length % 3) * 12,
        );
      } else {
        timeout = setTimeout(() => {
          deletingRef.current = true;
          setText(phrase.slice(0, phrase.length - 1));
        }, hold);
      }
    } else if (text.length > 0) {
      timeout = setTimeout(() => setText(phrase.slice(0, text.length - 1)), deleteSpeed);
    } else {
      deletingRef.current = false;
      timeout = setTimeout(() => setPhraseIndex((i) => i + 1), 220);
    }

    return () => clearTimeout(timeout);
  }, [text, phraseIndex, phrases, typeSpeed, deleteSpeed, hold, active, reduced]);

  useEffect(() => {
    if (!active) {
      setText('');
      deletingRef.current = false;
    }
  }, [active]);

  return reduced ? (phrases[0] ?? '') : text;
}

/**
 * Count a number up when the element enters the viewport.
 * Uses an eased rAF ramp rather than a linear interval so the last digits
 * decelerate — a linear counter looks mechanical.
 */
export function useCountUp(
  target: number,
  { duration = 1800, decimals = 0 }: { duration?: number; decimals?: number } = {},
) {
  const ref = useRef<HTMLElement | null>(null);
  const [value, setValue] = useState(0);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) {
      setValue(target);
      return;
    }

    let raf = 0;
    let start = 0;
    let observer: IntersectionObserver | null = null;

    const step = (now: number) => {
      if (!start) start = now;
      const t = clamp((now - start) / duration);
      // outExpo — matches the CSS easing vocabulary.
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setValue(Number((target * eased).toFixed(decimals)));
      if (t < 1) raf = requestAnimationFrame(step);
    };

    observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          raf = requestAnimationFrame(step);
          observer?.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(el);

    return () => {
      observer?.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [target, duration, decimals, reduced]);

  return [ref, value] as const;
}

/**
 * A value that slowly wanders between bounds — used for the simulated live
 * telemetry so numbers never sit perfectly still.
 */
export function useDriftingValue(base: number, spread: number, intervalMs = 2600) {
  const [value, setValue] = useState(base);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => {
      setValue(base + (Math.random() - 0.5) * 2 * spread);
    }, intervalMs);
    return () => clearInterval(id);
  }, [base, spread, intervalMs, reduced]);

  return value;
}

/* ══════════════════════════════════════════════════════════════════════════
   DOM UTILITIES
   ══════════════════════════════════════════════════════════════════════════ */

/** Lock body scroll (used by the command palette and mobile nav). */
export function useScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const { overflow, paddingRight } = document.body.style;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
    };
  }, [locked]);
}

/** Fire a callback on a key combination. */
export function useHotkey(
  match: (e: KeyboardEvent) => boolean,
  handler: (e: KeyboardEvent) => void,
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (match(e)) handlerRef.current(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // `match` is intentionally not a dep — callers pass inline predicates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Close on outside click / Escape. */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  onDismiss: () => void,
  active = true,
) {
  useEffect(() => {
    if (!active) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, onDismiss, active]);
}
