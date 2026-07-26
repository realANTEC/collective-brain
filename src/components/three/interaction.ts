/* ══════════════════════════════════════════════════════════════════════════
   CORE INTERACTION
   ──────────────────────────────────────────────────────────────────────────
   Direct manipulation of the Knowledge Core, kept deliberately separate from
   the scroll rig.

   Design decision: dragging rotates the *core*, not the camera. The camera is
   already owned by the scroll choreography, so letting the pointer move it too
   would produce two authorities fighting over one transform. Rotating the
   object instead means both systems compose cleanly — you can spin the core
   mid-scroll and neither interaction stutters.

   Zoom is bound to shift+wheel and pinch rather than plain wheel. Hijacking
   the wheel over a full-viewport canvas would break page scrolling, which is
   a worse sin than making zoom slightly less discoverable.
   ══════════════════════════════════════════════════════════════════════════ */

export const orbit = {
  yaw: 0,
  pitch: 0,
  yawVelocity: 0,
  pitchVelocity: 0,
  /** Multiplier applied to the core's scale. 1 = neutral. */
  zoom: 1,
  targetZoom: 1,
  dragging: false,
  /** True once the user has manipulated the core — used to retire the hint. */
  engaged: false,
};

const PITCH_LIMIT = 0.85; // radians — stop short of gimbal-flipping the poles

export function resetOrbit() {
  orbit.yaw = 0;
  orbit.pitch = 0;
  orbit.yawVelocity = 0;
  orbit.pitchVelocity = 0;
  orbit.targetZoom = 1;
}

/**
 * Attach drag/pinch handlers to the canvas element.
 * Returns a disposer.
 */
export function attachOrbitControls(el: HTMLElement) {
  let lastX = 0;
  let lastY = 0;
  let pointerId: number | null = null;
  const pinch = new Map<number, { x: number; y: number }>();
  let pinchStartDistance = 0;
  let pinchStartZoom = 1;

  const onPointerDown = (e: PointerEvent) => {
    pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinch.size === 2) {
      const [a, b] = [...pinch.values()];
      pinchStartDistance = Math.hypot(a.x - b.x, a.y - b.y);
      pinchStartZoom = orbit.targetZoom;
      orbit.dragging = false;
      return;
    }

    pointerId = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    orbit.dragging = true;
    orbit.engaged = true;
    orbit.yawVelocity = 0;
    orbit.pitchVelocity = 0;
    el.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (pinch.has(e.pointerId)) {
      pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (pinch.size === 2 && pinchStartDistance > 0) {
      const [a, b] = [...pinch.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      orbit.targetZoom = clampZoom(pinchStartZoom * (dist / pinchStartDistance));
      return;
    }

    if (!orbit.dragging || e.pointerId !== pointerId) return;

    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    // 0.005 rad/px puts a full rotation at roughly a 1250px drag — heavy
    // enough to feel like mass, light enough to spin with one gesture.
    orbit.yaw += dx * 0.005;
    orbit.pitch = Math.max(
      -PITCH_LIMIT,
      Math.min(PITCH_LIMIT, orbit.pitch + dy * 0.005),
    );

    // Carry velocity so releasing mid-gesture keeps the core spinning.
    orbit.yawVelocity = dx * 0.005;
    orbit.pitchVelocity = dy * 0.005;
  };

  const endPointer = (e: PointerEvent) => {
    pinch.delete(e.pointerId);
    if (pinch.size < 2) pinchStartDistance = 0;
    if (e.pointerId === pointerId) {
      orbit.dragging = false;
      pointerId = null;
    }
  };

  const onWheel = (e: WheelEvent) => {
    // Plain wheel belongs to the page. Only the shift modifier claims it.
    if (!e.shiftKey) return;
    e.preventDefault();
    orbit.targetZoom = clampZoom(orbit.targetZoom * (1 - e.deltaY * 0.0012));
    orbit.engaged = true;
  };

  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointermove', onPointerMove, { passive: true });
  el.addEventListener('pointerup', endPointer);
  el.addEventListener('pointercancel', endPointer);
  el.addEventListener('pointerleave', endPointer);
  el.addEventListener('wheel', onWheel, { passive: false });

  return () => {
    el.removeEventListener('pointerdown', onPointerDown);
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerup', endPointer);
    el.removeEventListener('pointercancel', endPointer);
    el.removeEventListener('pointerleave', endPointer);
    el.removeEventListener('wheel', onWheel);
  };
}

const clampZoom = (z: number) => Math.min(2.1, Math.max(0.55, z));

/**
 * Rotate the core so a direction in its own frame points at the camera.
 *
 * Solves for the (yaw, pitch) pair directly rather than easing a quaternion,
 * because yaw and pitch are what drag already writes — going through a
 * quaternion would need converting back, and the two systems would fight over
 * the same transform.
 *
 * The group's Euler order is pinned to 'YXZ' so the composition is
 * R = Ry(yaw) * Rx(pitch): pitch tilts first, then yaw swings. Under that
 * order Ry leaves the y component alone, so pitch can be solved from elevation
 * on its own and yaw from azimuth afterwards. With the default 'XYZ' the two
 * are coupled and neither has a closed form.
 *
 * Not every target is exactly reachable. Rx cannot change d.x and Ry cannot
 * change y, so an exact solution exists only when dx^2 + cy^2 <= 1 — i.e. for
 * directions close to the core's own x-poles. Those are clamped to the nearest
 * achievable aim rather than refused: bringing a concept *almost* to face the
 * camera is the intent, and refusing would make focus silently do nothing for
 * a slice of the sphere. Returns null only for a degenerate direction.
 */
export function solveFocusRotation(
  dir: [number, number, number],
  camDir: { x: number; y: number; z: number },
): { yaw: number; pitch: number } | null {
  const [dx, dy, dz] = dir;

  // Pitch: rotate d in the YZ plane until its y matches the camera's.
  // dy*cos - dz*sin = cy  <=>  R*cos(t + phi) = cy
  const r = Math.hypot(dy, dz);
  if (r < 1e-6) return null;
  const ratio = Math.max(-1, Math.min(1, camDir.y / r));
  const phi = Math.atan2(dz, dy);
  const pitch = Math.acos(ratio) - phi;

  // Apply it, then solve yaw from the remaining azimuth.
  const zAfter = dy * Math.sin(pitch) + dz * Math.cos(pitch);
  const yaw = Math.atan2(camDir.x, camDir.z) - Math.atan2(dx, zAfter);

  if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return null;
  return { yaw, pitch };
}

/** Shortest signed delta between two angles, so easing never takes the long way. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Advance drag inertia. Called once per frame from the render loop. */
export function stepOrbitInertia(dt: number) {
  if (orbit.dragging) return;

  orbit.yaw += orbit.yawVelocity;
  orbit.pitch = Math.max(
    -PITCH_LIMIT,
    Math.min(PITCH_LIMIT, orbit.pitch + orbit.pitchVelocity),
  );

  // Exponential decay tuned so a flick coasts for roughly a second.
  const decay = Math.exp(-3.2 * dt);
  orbit.yawVelocity *= decay;
  orbit.pitchVelocity *= decay;

  if (Math.abs(orbit.yawVelocity) < 1e-5) orbit.yawVelocity = 0;
  if (Math.abs(orbit.pitchVelocity) < 1e-5) orbit.pitchVelocity = 0;
}
