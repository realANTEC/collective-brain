'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

import { cn } from '@/lib/utils';
import { useHasPointer, usePrefersReducedMotion } from '@/lib/hooks';
import { SPRING_SNAP } from '@/lib/motion';

type Mode = 'idle' | 'hover' | 'grab';

/** Lights the ring without every control having to opt in by hand. */
const INTERACTIVE =
  'a[href], button, [role="button"], input, select, textarea, summary, [data-cursor="hover"]';

/** Near-rigid. The dot *is* the pointer — any visible lag reads as latency. */
const DOT_SPRING = { stiffness: 1800, damping: 78, mass: 0.26 };

/** The ring carries mass and arrives late. That lag is the entire effect. */
const RING_SPRING = { stiffness: 200, damping: 21, mass: 0.62 };

/**
 * Custom cursor.
 *
 * Position never touches React. Pointer coordinates feed two MotionValues,
 * each read by a pair of springs with different physics, and Framer writes the
 * transforms outside the reconciler — so a 120Hz pointer stream costs zero
 * renders. Only the discrete *mode* (idle / hover / grab / pressed) is state,
 * and that changes a handful of times a minute.
 *
 * The hit test runs on `pointerover`, which fires once per element boundary,
 * rather than on `pointermove`, which fires once per frame.
 */
export function Cursor() {
  const hasPointer = useHasPointer();
  const reduced = usePrefersReducedMotion();
  const enabled = hasPointer && !reduced;

  const [mode, setMode] = useState<Mode>('idle');
  const [pressed, setPressed] = useState(false);

  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const opacity = useMotionValue(0);

  const dotX = useSpring(x, DOT_SPRING);
  const dotY = useSpring(y, DOT_SPRING);
  const ringX = useSpring(x, RING_SPRING);
  const ringY = useSpring(y, RING_SPRING);

  const primed = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    // Hiding the native cursor is a *consequence* of the replacement being on
    // screen, never a precondition. Until the first `pointermove` we have no
    // coordinates, so the dot is still parked off-viewport at (-100, -100) at
    // opacity 0 — setting this on mount would leave the page with no pointer
    // at all for anyone who lands and does not immediately move the mouse.
    const takeOver = () => {
      document.body.dataset.customCursor = 'on';
    };

    // A re-run (reduced-motion toggled, pointer type changed) inherits a ref
    // that is already primed, so the replacement is live from the first frame.
    if (primed.current) takeOver();

    const onMove = (e: PointerEvent) => {
      if (!primed.current) {
        primed.current = true;
        // Teleport every follower to the first known position — otherwise the
        // springs sweep across the viewport from the off-screen origin.
        dotX.jump(e.clientX);
        dotY.jump(e.clientY);
        ringX.jump(e.clientX);
        ringY.jump(e.clientY);
        opacity.set(1);
        takeOver();
      }
      x.set(e.clientX);
      y.set(e.clientY);
    };

    const onOver = (e: PointerEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (!el) return setMode('idle');
      if (el.closest('[data-cursor="grab"]')) return setMode('grab');
      if (el.closest(INTERACTIVE)) return setMode('hover');
      setMode('idle');
    };

    const onDown = () => setPressed(true);
    const onUp = () => setPressed(false);
    const onExit = () => opacity.set(0);
    const onReturn = () => {
      if (primed.current) opacity.set(1);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerover', onOver, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('blur', onExit);
    document.documentElement.addEventListener('pointerleave', onExit);
    document.documentElement.addEventListener('pointerenter', onReturn);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerover', onOver);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('blur', onExit);
      document.documentElement.removeEventListener('pointerleave', onExit);
      document.documentElement.removeEventListener('pointerenter', onReturn);
      delete document.body.dataset.customCursor;
    };
  }, [enabled, x, y, opacity, dotX, dotY, ringX, ringY]);

  if (!enabled) return null;

  return (
    <>
      <motion.div
        aria-hidden
        className="pointer-events-none fixed top-0 left-0 z-[300]"
        style={{ x: ringX, y: ringY, opacity }}
      >
        {/* Centring lives in margins, not a translate — Framer owns `transform`
            on the parent and a second transform here would fight the spring. */}
        <motion.div
          className={cn(
            '-mt-5 -ml-5 size-10 rounded-full border',
            'transition-[background-color,border-color,box-shadow] duration-300 ease-out',
            mode === 'idle' && 'border-line-strong',
            mode === 'hover' &&
              'border-blue-soft/70 bg-blue/10 shadow-[0_0_28px_-6px_rgba(61,107,255,0.9)]',
            mode === 'grab' &&
              'border-dashed border-violet-soft/70 bg-violet/8',
          )}
          animate={{
            scaleX: mode === 'grab' ? 1.7 : mode === 'hover' ? 1.45 : 1,
            scaleY: mode === 'grab' ? 0.82 : mode === 'hover' ? 1.45 : 1,
          }}
          transition={SPRING_SNAP}
        />
      </motion.div>

      <motion.div
        aria-hidden
        className="pointer-events-none fixed top-0 left-0 z-[300] mix-blend-difference"
        style={{ x: dotX, y: dotY, opacity }}
      >
        <motion.div
          className="-mt-[3px] -ml-[3px] size-1.5 rounded-full bg-white"
          animate={{ scale: pressed ? 0.4 : mode === 'idle' ? 1 : 0.65 }}
          transition={SPRING_SNAP}
        />
      </motion.div>
    </>
  );
}
