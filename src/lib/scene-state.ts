/* ══════════════════════════════════════════════════════════════════════════
   SCENE STATE — the bridge between the DOM and the WebGL layer
   ──────────────────────────────────────────────────────────────────────────
   The 3D scene has to react to scroll position, pointer movement and search
   interactions at 60–120fps. Routing that through React state would trigger a
   reconciliation pass on every frame and torch the frame budget.

   Instead this module owns a single mutable object. The DOM side *writes* to
   it (scroll handlers, pointer handlers, the search field); the render loop
   *reads* it inside useFrame. Zero re-renders, zero allocations per frame.

   A tiny subscribe() exists for the handful of DOM components that genuinely
   need to re-render on discrete changes (e.g. the active section indicator) —
   those are throttled to section boundaries, not raw scroll.
   ══════════════════════════════════════════════════════════════════════════ */

export type QualityTier = 'high' | 'medium' | 'low';

export interface SceneState {
  /** 0 → 1 across the entire scrollable page. */
  scrollProgress: number;
  /** Raw pixel scroll offset — used for parallax that needs absolute units. */
  scrollY: number;
  /** Instantaneous scroll velocity in px/frame, smoothed. Drives motion blur-ish effects. */
  scrollVelocity: number;

  /** Index of the section currently occupying the viewport centre. */
  section: number;
  /** 0 → 1 progress through the active section. */
  sectionProgress: number;
  /**
   * Continuous position along the section sequence: 2.4 means "40% of the way
   * from section 2 to section 3".
   *
   * This, not scrollProgress, is what the camera choreography samples. Raw
   * scroll fraction assumes every section is the same height — they are not,
   * so keyframes drift badly out of sync with the content they were composed
   * for (the camera ends up inside the core while a dense text section is on
   * screen).
   */
  sectionFloat: number;

  /** Pointer in normalised device coords (-1 → 1), raw. */
  pointerX: number;
  pointerY: number;
  /** Same, exponentially smoothed. Use this for anything the camera touches. */
  smoothPointerX: number;
  smoothPointerY: number;
  /** Whether the pointer is currently over the viewport. */
  pointerActive: boolean;

  /** 0 → 1 eased focus weight of the hero search field. */
  searchFocus: number;
  /** Where searchFocus is heading. Written by the field, damped by PointerBridge. */
  searchFocusTarget: number;
  /** Impulse 0 → 1 that decays after a query is submitted. Drives the light wave. */
  searchPulse: number;
  /** Monotonic counter — increments once per submitted query so the scene can
   *  spawn a new cluster of nodes without diffing strings. */
  queryCount: number;

  /** Index of the concept node under the pointer, or -1. */
  hoveredNode: number;

  /** Adaptive quality, resolved once on mount then downgraded if fps sags. */
  quality: QualityTier;
  /** True when the OS asks for reduced motion. */
  reducedMotion: boolean;
  /** True once the preloader has handed off — gates the entrance choreography. */
  ready: boolean;
}

export const scene: SceneState = {
  scrollProgress: 0,
  scrollY: 0,
  scrollVelocity: 0,
  section: 0,
  sectionProgress: 0,
  sectionFloat: 0,
  pointerX: 0,
  pointerY: 0,
  smoothPointerX: 0,
  smoothPointerY: 0,
  pointerActive: false,
  searchFocus: 0,
  searchFocusTarget: 0,
  searchPulse: 0,
  queryCount: 0,
  hoveredNode: -1,
  quality: 'high',
  reducedMotion: false,
  ready: false,
};

/**
 * Development-only inspection hook.
 *
 * Because the scene deliberately bypasses React, there is no devtools view of
 * it — every value that matters lives in this object and is read inside
 * useFrame. Exposing it lets you inspect (and poke) the live scene from the
 * console while tuning choreography. Stripped from production bundles by the
 * NODE_ENV check.
 */
if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
  (window as unknown as { __cbScene?: SceneState }).__cbScene = scene;
}

/* ── Discrete-change subscription ─────────────────────────────────────────── */

type Listener = () => void;
const listeners = new Set<Listener>();

/** Subscribe to *discrete* scene changes (section, ready, quality). */
export function subscribeScene(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn();
}

/* ── Mutators ─────────────────────────────────────────────────────────────── */

export function setSection(index: number, progress: number) {
  scene.sectionProgress = progress;
  if (scene.section !== index) {
    scene.section = index;
    emit();
  }
}

export function setReady(ready: boolean) {
  if (scene.ready !== ready) {
    scene.ready = ready;
    emit();
  }
}

export function setQuality(quality: QualityTier) {
  if (scene.quality !== quality) {
    scene.quality = quality;
    emit();
  }
}

/**
 * Fire a light wave through the graph. Called when a query is submitted —
 * the scene picks this up next frame and decays it back to zero, so callers
 * never have to clean up.
 */
export function pulseScene(strength = 1) {
  scene.searchPulse = Math.min(1, scene.searchPulse + strength);
  scene.queryCount += 1;
}

/* ── Snapshot for React consumers ─────────────────────────────────────────── */

let snapshot = { section: 0, ready: false, quality: 'high' as QualityTier };

/** Cached snapshot so useSyncExternalStore doesn't loop on identity changes. */
export function getSceneSnapshot() {
  if (
    snapshot.section !== scene.section ||
    snapshot.ready !== scene.ready ||
    snapshot.quality !== scene.quality
  ) {
    snapshot = {
      section: scene.section,
      ready: scene.ready,
      quality: scene.quality,
    };
  }
  return snapshot;
}

const SERVER_SNAPSHOT = {
  section: 0,
  ready: false,
  quality: 'high' as QualityTier,
};
export const getSceneServerSnapshot = () => SERVER_SNAPSHOT;
