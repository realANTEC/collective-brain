import type { Transition, Variants } from 'framer-motion';

/* ==========================================================================
   MOTION LANGUAGE
   --------------------------------------------------------------------------
   One vocabulary, used everywhere. The rule: nothing eases linearly, nothing
   arrives without a settle, and nothing that carries mass moves faster than
   the eye can follow it.

   Three tiers:
     - SNAP    micro-interactions the finger drives (hover, press, toggle)
     - SETTLE  content arriving on screen (reveals, cards, panels)
     - DRIFT   ambient, never-ending, barely perceptible
   ========================================================================== */

/** A cubic-bezier control tuple, in the shape Framer Motion expects. */
type Bezier = [number, number, number, number];

/** Cubic-bezier tuples mirrored from globals.css so JS and CSS agree exactly. */
export const EASE: Record<
  'outExpo' | 'outQuint' | 'inOutQuint' | 'settle',
  Bezier
> = {
  outExpo: [0.16, 1, 0.3, 1],
  outQuint: [0.22, 1, 0.36, 1],
  inOutQuint: [0.83, 0, 0.17, 1],
  settle: [0.22, 1.16, 0.36, 1],
};

/* -- Springs ------------------------------------------------------------- */

/** Fast, near-critically damped. For pointer-driven micro-interactions. */
export const SPRING_SNAP: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 32,
  mass: 0.7,
};

/** The house spring. Slight overshoot, then a clean settle. */
export const SPRING_SETTLE: Transition = {
  type: 'spring',
  stiffness: 180,
  damping: 22,
  mass: 1,
};

/** Heavy elements: large panels, the search field expanding. */
export const SPRING_MASS: Transition = {
  type: 'spring',
  stiffness: 120,
  damping: 24,
  mass: 1.35,
};

/** Cursor / magnetic follow. Deliberately loose so it trails the pointer. */
export const SPRING_FOLLOW: Transition = {
  type: 'spring',
  stiffness: 340,
  damping: 30,
  mass: 0.5,
};

/* -- Tweens -------------------------------------------------------------- */

export const TWEEN_FAST: Transition = { duration: 0.18, ease: EASE.outQuint };
export const TWEEN_BASE: Transition = { duration: 0.42, ease: EASE.outExpo };
export const TWEEN_SLOW: Transition = { duration: 0.9, ease: EASE.outExpo };

/* -- Viewport defaults --------------------------------------------------- */

/**
 * Reveal slightly *before* the element is fully on screen so motion has already
 * begun by the time the eye lands on it. `once` everywhere - replaying reveals
 * on scroll-back reads as jitter, not delight.
 */
export const VIEWPORT = { once: true, margin: '-12% 0px -12% 0px' } as const;

export const VIEWPORT_EARLY = {
  once: true,
  margin: '-2% 0px -2% 0px',
} as const;

/* -- Variants ------------------------------------------------------------ */

/** Parent that staggers its children. Pair with any child variant below. */
export const stagger = (
  staggerChildren = 0.06,
  delayChildren = 0,
): Variants => ({
  hidden: {},
  visible: { transition: { staggerChildren, delayChildren } },
});

/** The default arrival: up, in, and slightly de-blurred. */
export const riseIn: Variants = {
  hidden: { opacity: 0, y: 26, filter: 'blur(6px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.85, ease: EASE.outExpo },
  },
};

/** Same as riseIn but without the blur - cheaper for long lists. */
export const riseInFlat: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: EASE.outExpo },
  },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 1.1, ease: EASE.outExpo } },
};

/**
 * Line-by-line text reveal. Each line lives in an overflow-hidden wrapper and
 * slides up from below its own baseline - the classic editorial reveal, but
 * with a touch of scale so it reads as depth rather than a slide.
 */
export const lineReveal: Variants = {
  hidden: { y: '110%', opacity: 0, scaleY: 1.06 },
  visible: {
    y: '0%',
    opacity: 1,
    scaleY: 1,
    transition: { duration: 1.05, ease: EASE.outExpo },
  },
};

/** Cards assembling themselves - arrive from depth with a slight rotation. */
export const assembleIn: Variants = {
  hidden: { opacity: 0, y: 40, scale: 0.94, rotateX: 8 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    rotateX: 0,
    transition: { duration: 1, ease: EASE.outExpo },
  },
};

/** Panel scaling open from its own centre (command palette, search results). */
export const panelIn: Variants = {
  hidden: { opacity: 0, scale: 0.965, y: 12, filter: 'blur(10px)' },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: SPRING_MASS,
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    y: 6,
    filter: 'blur(8px)',
    transition: { duration: 0.16, ease: EASE.outQuint },
  },
};

/** Horizontal draw for rules and connector lines. */
export const drawX: Variants = {
  hidden: { scaleX: 0, opacity: 0 },
  visible: {
    scaleX: 1,
    opacity: 1,
    transition: { duration: 1.3, ease: EASE.outExpo },
  },
};

/** SVG path draw-on. Apply to <motion.path> with pathLength. */
export const drawPath: Variants = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: {
    pathLength: 1,
    opacity: 1,
    transition: {
      pathLength: { duration: 1.6, ease: EASE.outExpo },
      opacity: { duration: 0.3 },
    },
  },
};

/* -- Reduced-motion fallbacks -------------------------------------------- */

/**
 * When the user prefers reduced motion we do not merely shorten durations -
 * we swap to opacity-only. Components pick the variant set via
 * `pickVariants(prefersReduced, riseIn)`.
 */
export const reducedVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.25 } },
};

export const pickVariants = (reduced: boolean, variants: Variants): Variants =>
  reduced ? reducedVariants : variants;
