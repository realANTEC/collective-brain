'use client';

import { useEffect } from 'react';
import { scene } from '@/lib/scene-state';
import { damp } from '@/lib/utils';

/**
 * Feeds pointer position into the scene singleton and keeps a smoothed copy.
 *
 * The smoothing happens in one rAF loop here rather than inside useFrame so
 * that DOM consumers (the custom cursor, parallax layers) and the WebGL
 * consumers (camera sway, particle attraction) read the *same* smoothed value
 * on the same frame. Two independent smoothers would visibly diverge when the
 * pointer moves quickly.
 *
 * Renders nothing.
 */
export function PointerBridge() {
  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const onMove = (e: PointerEvent) => {
      scene.pointerX = (e.clientX / window.innerWidth) * 2 - 1;
      scene.pointerY = -((e.clientY / window.innerHeight) * 2 - 1);
      scene.pointerActive = true;
    };

    const onLeave = () => {
      scene.pointerActive = false;
      scene.pointerX = 0;
      scene.pointerY = 0;
    };

    const tick = (now: number) => {
      // Clamped at both ends. `last` is seeded from performance.now() but
      // updated from the rAF timestamp, and those are not guaranteed to be
      // ordered: a frame callback can carry a timestamp from before the effect
      // that scheduled it. A negative delta here would invert the decay below
      // and make the impulse *grow* instead of fade, latching the whole scene
      // at maximum brightness.
      const dt = Math.min(0.064, Math.max(0, (now - last) / 1000));
      last = now;
      scene.smoothPointerX = damp(scene.smoothPointerX, scene.pointerX, 4.5, dt);
      scene.smoothPointerY = damp(scene.smoothPointerY, scene.pointerY, 4.5, dt);
      // Search focus and pulse decay live here too so nothing has to clean up
      // after firing an impulse.
      scene.searchFocus = damp(scene.searchFocus, scene.searchFocusTarget, 5, dt);
      scene.searchPulse = Math.max(0, scene.searchPulse - dt * 0.55);
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
