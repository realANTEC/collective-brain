'use client';

import { useEffect } from 'react';
import type Lenis from 'lenis';
import { scene } from '@/lib/scene-state';
import { usePrefersReducedMotion } from '@/lib/hooks';

let registered = false;

/** The live Lenis instance, or null when reduced-motion hands scroll back to
 *  the browser. Module scope rather than a window augmentation — the lenis
 *  package already declares its own `window.lenis` shape. */
let lenisInstance: Lenis | null = null;

/**
 * Smooth scroll + the single source of scroll truth for the whole app.
 *
 * Three things have to agree on where the page is: Lenis (which owns the
 * actual transform), GSAP ScrollTrigger (which drives section choreography),
 * and the WebGL scene (which reads scroll every frame). Running three separate
 * rAF loops would drift them apart by a frame or more and produce visible
 * shear between the 3D layer and the DOM.
 *
 * So we drive everything from GSAP's ticker: Lenis advances, ScrollTrigger
 * updates from Lenis' scroll event, and the scene singleton is written in the
 * same pass. One clock, no shear.
 */
export function SmoothScroll({ children }: { children: React.ReactNode }) {
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    // Reduced motion gets native scrolling — inertial scrolling is exactly the
    // kind of motion the preference exists to suppress. This path loads neither
    // Lenis nor GSAP.
    if (reduced) {
      const onNativeScroll = () => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        scene.scrollY = window.scrollY;
        scene.scrollProgress = max > 0 ? window.scrollY / max : 0;
        scene.scrollVelocity = 0;
      };
      window.addEventListener('scroll', onNativeScroll, { passive: true });
      onNativeScroll();
      return () => window.removeEventListener('scroll', onNativeScroll);
    }

    let disposed = false;
    let dispose: (() => void) | undefined;

    /**
     * Lenis and GSAP are imported here rather than at module scope.
     *
     * Together they are ~150kB, and neither is needed until after first paint —
     * nothing renders differently because smooth scrolling has not booted yet.
     * A static import puts both in the initial chunk of every page and delays
     * the moment the hero becomes interactive for no benefit.
     */
    void (async () => {
      const [{ gsap }, { ScrollTrigger }, { default: LenisCtor }] =
        await Promise.all([
          import('gsap'),
          import('gsap/ScrollTrigger'),
          import('lenis'),
        ]);
      if (disposed) return;

      if (!registered) {
        gsap.registerPlugin(ScrollTrigger);
        registered = true;
      }

      dispose = start(gsap, ScrollTrigger, LenisCtor);
    })();

    return () => {
      disposed = true;
      dispose?.();
    };
  }, [reduced]);

  return <>{children}</>;
}

/** Boots Lenis on the GSAP ticker. Returns its disposer. */
function start(
  gsap: typeof import('gsap')['gsap'],
  ScrollTrigger: typeof import('gsap/ScrollTrigger')['ScrollTrigger'],
  LenisCtor: typeof import('lenis')['default'],
) {
  const lenis = new LenisCtor({
      // ~1.05s to settle: long enough to feel weighted, short enough that a
      // deliberate scroll still feels direct.
      duration: 1.05,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.6,
      // Touch devices already have native momentum; layering ours on top makes
      // the page feel slippery and disconnected from the finger.
      syncTouch: false,
      autoRaf: false,
    });

    let lastScroll = 0;

    lenis.on('scroll', (e: { scroll: number; progress: number }) => {
      const velocity = e.scroll - lastScroll;
      lastScroll = e.scroll;
      scene.scrollY = e.scroll;
      scene.scrollProgress = e.progress;
      // Smooth the velocity so a single jerky wheel tick doesn't spike effects.
      scene.scrollVelocity += (velocity - scene.scrollVelocity) * 0.18;
      ScrollTrigger.update();
    });

    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    // GSAP's lag smoothing fights an external scroll driver — it can pause the
    // ticker mid-scroll and freeze Lenis for a frame.
    gsap.ticker.lagSmoothing(0);

    lenisInstance = lenis;

    const onResize = () => ScrollTrigger.refresh();
    window.addEventListener('resize', onResize);

  return () => {
    gsap.ticker.remove(tick);
    window.removeEventListener('resize', onResize);
    lenis.destroy();
    lenisInstance = null;
  };
}

/** Scroll to an element or offset, honouring whichever scroller is active. */
export function scrollTo(target: string | number, offset = 0) {
  if (lenisInstance) {
    lenisInstance.scrollTo(target, { offset, duration: 1.4 });
    return;
  }
  if (typeof target === 'number') {
    window.scrollTo({ top: target + offset, behavior: 'smooth' });
    return;
  }
  const el = document.querySelector(target);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
