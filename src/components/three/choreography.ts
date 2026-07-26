import { clamp, lerp, smoothstep } from '@/lib/utils';

/* ══════════════════════════════════════════════════════════════════════════
   SCROLL CHOREOGRAPHY
   ──────────────────────────────────────────────────────────────────────────
   One continuous camera move across the whole page. The 3D layer never cuts —
   it is a single shot that the DOM sections scroll over, which is what makes
   the transitions read as one experience rather than nine stacked pages.

   Each keyframe below is anchored to a section. Between keyframes we
   interpolate with smoothstep so the camera has zero velocity at every anchor:
   it arrives, holds, and departs, rather than sliding at constant speed.
   ══════════════════════════════════════════════════════════════════════════ */

export interface CameraKeyframe {
  /** Camera position. */
  position: [number, number, number];
  /** Look-at target — usually the core, occasionally offset for asymmetry. */
  target: [number, number, number];
  fov: number;
  /** Scale of the core body. */
  coreScale: number;
  /** Master opacity of the whole 3D layer. */
  opacity: number;
  /**
   * Opacity on narrow viewports.
   *
   * Not a nicety. The core occupies about a third of a desktop frame but spans
   * a phone edge to edge, so an opacity that reads as atmosphere at 1440px
   * reads as noise at 390px and swallows the copy sitting on top of it. Every
   * keyframe therefore carries its own phone value rather than a blanket
   * multiplier, because the sections differ in how much the core should still
   * assert itself. Falls back to `opacity` when omitted.
   */
  opacityMobile?: number;
  /** 0 → 1 how much of the connection network is drawn. */
  connections: number;
  /** 0 → 1 birth gate for the dense point population. */
  population: number;
  /** How strongly the pointer perturbs particles here. */
  pointerInfluence: number;
}

/**
 * Nine anchors, one per section. Read this top to bottom and you can see the
 * whole film: arrive → approach → circle → pull back → dive inside → rise →
 * orbit → retreat → return.
 */
export const KEYFRAMES: CameraKeyframe[] = [
  // 01 — Hero. The core nests inside the headline rather than behind the
  //      sub-copy: the target is pushed below the origin, which lifts the body
  //      up in frame and off the lead paragraph and search field.
  {
    position: [0, 0.35, 7.6],
    target: [0, -0.62, 0],
    fov: 40,
    coreScale: 1,
    opacity: 0.9,
    opacityMobile: 0.6,
    connections: 0.18,
    population: 0.62,
    pointerInfluence: 0.7,
  },
  // 02 — The Core appears. Close enough to dominate, far enough that the body
  //      stays inside the empty middle third and clears both text columns.
  {
    position: [0, 0.05, 6.3],
    target: [0, 0, 0],
    fov: 38,
    coreScale: 1,
    opacity: 1,
    // The section's copy sits directly over the body once the columns stack.
    opacityMobile: 0.38,
    connections: 0.34,
    population: 0.78,
    pointerInfluence: 1,
  },
  // 03 — Connections form. Off-axis so arcs read as depth, not a flat mesh.
  //      The section already carries its own SVG constellation on the left and
  //      body copy on the right, so the core steps back to a supporting level
  //      rather than competing with both.
  {
    position: [2.2, 0.8, 5.8],
    target: [0.3, 0.15, 0],
    fov: 42,
    coreScale: 1.05,
    opacity: 0.45,
    opacityMobile: 0.2,
    connections: 1,
    population: 0.86,
    pointerInfluence: 1,
  },
  // 04 — Conversations merge. Pull back and to the other side. From here on the
  //      DOM owns the frame, so opacity drops sharply: dense text sections need
  //      the core as atmosphere, not as competition.
  {
    position: [-2.6, -0.6, 6.4],
    target: [0.2, 0.1, 0],
    fov: 44,
    coreScale: 1.05,
    opacity: 0.34,
    opacityMobile: 0.15,
    connections: 1,
    population: 0.9,
    pointerInfluence: 0.55,
  },
  // 05 — The graph expands. The closest approach of the whole film: the cloud
  //      opens out and fills more of the frame than anywhere else. The target
  //      is pushed right of the origin, which slides the body left in frame and
  //      keeps the execution timeline in the right-hand column legible — going
  //      any nearer, or centring it, buries that copy entirely.
  {
    position: [0, 0.1, 4.0],
    target: [0.85, 0, 0],
    fov: 54,
    coreScale: 1.18,
    opacity: 0.32,
    opacityMobile: 0.18,
    connections: 1,
    population: 1,
    pointerInfluence: 1,
  },
  // 06 — How memory works. Rise above, look down the axis.
  {
    position: [2.8, 2.4, 6.2],
    target: [0, -0.15, 0],
    fov: 40,
    coreScale: 1.05,
    opacity: 0.19,
    opacityMobile: 0.12,
    connections: 0.92,
    population: 1,
    pointerInfluence: 0.6,
  },
  // 07 — Community validation. Mirror orbit, slightly below the equator.
  {
    position: [-2.9, -1.2, 6.6],
    target: [0, 0.05, 0],
    fov: 40,
    coreScale: 1.02,
    opacity: 0.15,
    connections: 0.9,
    population: 1,
    pointerInfluence: 0.6,
  },
  // 08 — Pricing. Retreat; the core dims to near-ambience so the plans read.
  {
    position: [0, 0.5, 9.6],
    target: [0, 0, 0],
    fov: 34,
    coreScale: 1,
    opacity: 0.17,
    opacityMobile: 0.1,
    connections: 0.7,
    population: 1,
    pointerInfluence: 0.4,
  },
  // 09 — CTA. Return to the front, close and bright. The film ends on the
  //      subject it opened on.
  {
    position: [0, 0, 6.2],
    target: [0, -0.35, 0],
    fov: 42,
    coreScale: 1.12,
    opacity: 0.92,
    opacityMobile: 0.68,
    connections: 1,
    population: 1,
    pointerInfluence: 0.9,
  },
  // 10 — Footer. Not a numbered section, but it needs an anchor of its own:
  //      without one the sampler clamps at the CTA keyframe and the core stays
  //      bright straight through the link columns. It withdraws to a distant
  //      ember instead, so the closing plate reads.
  {
    position: [0, 0.2, 11.5],
    target: [0, -0.2, 0],
    fov: 32,
    coreScale: 0.95,
    opacity: 0.12,
    connections: 0.55,
    population: 1,
    pointerInfluence: 0.25,
  },
];

export const SECTION_COUNT = KEYFRAMES.length;

/** Mutable result object — reused every frame so the loop allocates nothing. */
export interface ChoreographyState {
  px: number;
  py: number;
  pz: number;
  tx: number;
  ty: number;
  tz: number;
  fov: number;
  coreScale: number;
  opacity: number;
  connections: number;
  population: number;
  pointerInfluence: number;
}

export const choreographyState: ChoreographyState = {
  px: 0,
  py: 0,
  pz: 7.4,
  tx: 0,
  ty: 0,
  tz: 0,
  fov: 40,
  coreScale: 1,
  opacity: 0,
  connections: 0.18,
  population: 0.62,
  pointerInfluence: 0.7,
};

/**
 * Sample the camera path at a continuous section position.
 *
 * The argument is `scene.sectionFloat` — 2.4 meaning "40% of the way from
 * section 2 to section 3" — NOT a 0→1 scroll fraction. Sections differ in
 * height by a factor of three, so a scroll fraction would put keyframe 5 in
 * the middle of section 3.
 *
 * `smoothstep` between anchors rather than linear interpolation is the other
 * half of the trick: it zeroes the derivative at each keyframe, so the camera
 * decelerates into every section and accelerates out of it. Linear
 * interpolation produces a camera that visibly changes direction at each
 * anchor.
 */
export function sampleChoreography(
  sectionFloat: number,
  narrow = false,
): ChoreographyState {
  const clamped = Math.min(SECTION_COUNT - 1, Math.max(0, sectionFloat));
  const i = Math.min(SECTION_COUNT - 2, Math.floor(clamped));
  const localT = clamp(clamped - i);
  const t = smoothstep(0, 1, localT);

  const a = KEYFRAMES[i];
  const b = KEYFRAMES[i + 1];

  choreographyState.px = lerp(a.position[0], b.position[0], t);
  choreographyState.py = lerp(a.position[1], b.position[1], t);
  choreographyState.pz = lerp(a.position[2], b.position[2], t);
  choreographyState.tx = lerp(a.target[0], b.target[0], t);
  choreographyState.ty = lerp(a.target[1], b.target[1], t);
  choreographyState.tz = lerp(a.target[2], b.target[2], t);
  choreographyState.fov = lerp(a.fov, b.fov, t);
  choreographyState.coreScale = lerp(a.coreScale, b.coreScale, t);
  const opacityOf = (k: CameraKeyframe) =>
    narrow ? (k.opacityMobile ?? k.opacity) : k.opacity;
  choreographyState.opacity = lerp(opacityOf(a), opacityOf(b), t);
  choreographyState.connections = lerp(a.connections, b.connections, t);
  choreographyState.population = lerp(a.population, b.population, t);
  choreographyState.pointerInfluence = lerp(
    a.pointerInfluence,
    b.pointerInfluence,
    t,
  );

  return choreographyState;
}
