/* ══════════════════════════════════════════════════════════════════════════
   GLSL — the Knowledge Core
   ──────────────────────────────────────────────────────────────────────────
   Notes on the approach:

   · Glow is procedural, not post-processed. Each point renders a soft core
     plus a wide low-alpha halo under additive blending, which produces most
     of what a bloom pass would give for a fraction of the cost. Real bloom is
     layered on top only on the high-quality tier.

   · Everything animated is driven by uniforms updated once per frame from the
     scene singleton — no per-point CPU work, no geometry re-uploads. The
     assembly animation, the search wave, the graph growth and the pointer
     attraction are all vertex-shader displacements of a static buffer.

   · Blending is additive with depthWrite off, so draw order never matters and
     overlapping particles accumulate light the way real luminous dust does.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Shared GLSL prelude.
 *
 * `smoothstep(edge0, edge1, x)` is UNDEFINED when edge0 > edge1. Writing a
 * falloff as `smoothstep(outer, inner, d)` happens to work on most desktop
 * drivers, which implement it as the raw formula — but it is not portable, and
 * SwiftShader (Chrome's software renderer, used whenever the GPU is
 * blocklisted) returns 0 for it. That single detail is enough to make the
 * entire core render as a black rectangle on those machines.
 *
 * So every falloff goes through this helper instead, with edges always in
 * ascending order.
 */
const GLSL_PRELUDE = /* glsl */ `
  // The precision statement has to precede any float-typed declaration,
  // including this helper's signature — otherwise the fragment compiler
  // rejects the definition and every later call reports "function name
  // expected". Declaring it here means no shader body needs its own.
  precision highp float;

  // 1 at x <= inner, easing to 0 at x >= outer.
  float falloff(float inner, float outer, float x) {
    return 1.0 - smoothstep(inner, outer, x);
  }
`;

export const corePointsVertex = GLSL_PRELUDE + /* glsl */ `
  uniform float uTime;
  uniform float uReveal;      // 0 → 1 assembly progress
  uniform float uPulse;       // 0 → 1 search impulse, decaying
  uniform float uWaveFront;   // radius of the expanding light wave
  uniform float uVisibility;  // graph-growth gate; points above this are unborn
  uniform vec3  uPointer;     // pointer projected onto the core's near surface
  uniform float uPointerAmt;  // 0 → 1 pointer influence
  uniform float uSize;
  uniform float uDpr;
  uniform float uScale;       // breathing / scroll-driven scale

  attribute vec3  aScatter;
  attribute float aSeed;
  attribute float aRadius;

  varying float vSeed;
  varying float vGlow;
  varying float vDepth;
  varying float vVis;

  void main() {
    // ── Assembly ──────────────────────────────────────────────────────────
    // Each point has its own delay, so the core condenses out of the cloud in
    // a rolling wave rather than snapping into place all at once.
    float delay = aSeed * 0.42;
    float t = clamp((uReveal - delay) / 0.58, 0.0, 1.0);
    float ease = 1.0 - pow(1.0 - t, 4.0);
    vec3 pos = mix(aScatter, position, ease);

    // ── Ambient life ──────────────────────────────────────────────────────
    float phase = aSeed * 6.2831853;
    vec3 wobble = vec3(
      sin(uTime * 0.34 + phase),
      cos(uTime * 0.28 + phase * 1.73),
      sin(uTime * 0.41 + phase * 0.61)
    ) * 0.022 * ease;
    pos += wobble;

    // Slow differential rotation: outer strata lag the core, which is what
    // makes the body read as fluid rather than as one rigid object.
    float spin = uTime * 0.055 * (1.25 - aRadius * 0.35);
    float cs = cos(spin);
    float sn = sin(spin);
    pos = vec3(pos.x * cs - pos.z * sn, pos.y, pos.x * sn + pos.z * cs);

    pos *= uScale;

    // ── Pointer attraction ────────────────────────────────────────────────
    vec3 toPointer = uPointer - pos;
    float pd = length(toPointer);
    float influence = falloff(0.0, 1.9, pd) * uPointerAmt;
    pos += normalize(toPointer + 1e-5) * influence * 0.14;

    // ── Search wave ───────────────────────────────────────────────────────
    // A shell of light expanding from the nucleus outward. Points briefly
    // push outward and brighten as the front passes through them.
    float waveDist = abs(aRadius * uScale - uWaveFront);
    float wave = falloff(0.0, 0.3, waveDist) * uPulse;
    pos *= 1.0 + wave * 0.11;

    // ── Birth gate ────────────────────────────────────────────────────────
    vVis = falloff(uVisibility - 0.07, uVisibility, aSeed);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    vSeed = aSeed;
    vDepth = -mv.z;
    vGlow = ease * (0.28 + aSeed * 0.62) + wave * 1.9 + influence * 1.35;

    // PROJECTION_SCALE converts a world-space radius into pixels. It is tuned
    // so a shell point lands around 1-3px at the hero camera distance and
    // swells naturally as the camera dives inside the core. Set it too high and
    // every point saturates the clamp, which turns the whole body into one
    // blown-out disc rather than a cloud of resolvable particles.
    float base = uSize * (0.5 + aSeed * 0.95);
    float ps = base * (1.0 + wave * 2.4 + influence * 1.5) * (11.0 / max(0.001, -mv.z));
    gl_PointSize = clamp(ps * uDpr, 0.0, 26.0) * vVis;
  }
`;

export const corePointsFragment = GLSL_PRELUDE + /* glsl */ `
  precision highp float;

  uniform vec3  uColorA;   // electric blue — the base population
  uniform vec3  uColorB;   // soft violet  — the mid band
  uniform vec3  uColorC;   // cyan         — the rare highlights
  uniform float uOpacity;

  varying float vSeed;
  varying float vGlow;
  varying float vDepth;
  varying float vVis;

  void main() {
    // Procedural sprite: no texture fetch, perfectly round at any size.
    vec2 uv = gl_PointCoord - 0.5;
    float d2 = dot(uv, uv) * 4.0;
    if (d2 > 1.0) discard;

    float radial = 1.0 - d2;
    float core = pow(radial, 3.2);          // tight bright centre
    float halo = pow(radial, 1.15) * 0.34;  // wide soft bloom
    float alpha = core + halo;

    vec3 col = mix(uColorA, uColorB, smoothstep(0.05, 0.85, vSeed));
    col = mix(col, uColorC, smoothstep(0.68, 1.0, vSeed) * 0.9);
    col *= 0.5 + vGlow;

    // Depth attenuation stops the far side of the shell from competing with
    // the near side — without it the sphere reads as a flat disc.
    float depthFade = falloff(2.5, 30.0, vDepth);

    gl_FragColor = vec4(col, alpha * uOpacity * depthFade * vVis);
  }
`;

/* ── Connections ──────────────────────────────────────────────────────────── */

export const connectionsVertex = GLSL_PRELUDE + /* glsl */ `
  uniform float uTime;
  uniform float uDraw;     // 0 → 1 progressive draw-on of the network
  uniform float uPulse;    // global search impulse
  uniform float uScale;
  uniform float uOpacity;

  attribute float aProgress;  // 0 → 1 along the owning arc
  attribute float aSeed;      // constant per arc
  attribute float aWeight;    // shorter arcs are brighter

  varying float vAlpha;
  varying float vSeed;
  varying float vHot;

  void main() {
    vec3 pos = position * uScale;

    // Match the core's differential rotation so connections stay anchored to
    // the nodes they belong to.
    float spin = uTime * 0.055 * (1.25 - length(position) * 0.35);
    float cs = cos(spin);
    float sn = sin(spin);
    pos = vec3(pos.x * cs - pos.z * sn, pos.y, pos.x * sn + pos.z * cs);

    // ── Progressive draw ──────────────────────────────────────────────────
    // Arcs unspool one end to the other, staggered by their own seed.
    float arcStart = aSeed * 0.68;
    float local = clamp((uDraw - arcStart) / 0.32, 0.0, 1.0);
    float drawn = falloff(local - 0.09, local, aProgress);

    // ── Travelling pulse ──────────────────────────────────────────────────
    // A packet of light runs the length of each connection at its own rate:
    // information physically moving through the graph.
    float speed = 0.09 + aSeed * 0.16;
    float head = fract(uTime * speed + aSeed * 7.13);
    float d = abs(aProgress - head);
    d = min(d, 1.0 - d);
    float packet = falloff(0.0, 0.11, d);

    vHot = packet + uPulse * 0.85;
    vAlpha = (0.085 + vHot * 0.72) * aWeight * drawn * uOpacity;
    vSeed = aSeed;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

export const connectionsFragment = /* glsl */ `
  precision highp float;

  uniform vec3 uColorA;
  uniform vec3 uColorB;

  varying float vAlpha;
  varying float vSeed;
  varying float vHot;

  void main() {
    vec3 col = mix(uColorA, uColorB, vSeed);
    // The travelling packet reads white-hot at its centre; the resting line
    // stays a cool, low-contrast thread.
    col = mix(col, vec3(1.0), clamp(vHot * 0.55, 0.0, 0.75));
    gl_FragColor = vec4(col * (0.6 + vHot), vAlpha);
  }
`;

/* ── Concept nodes ────────────────────────────────────────────────────────── */

export const nodesVertex = GLSL_PRELUDE + /* glsl */ `
  uniform float uTime;
  uniform float uReveal;
  uniform float uPulse;
  uniform float uScale;
  uniform float uSize;
  uniform float uDpr;
  uniform vec3  uPointer;
  uniform float uPointerAmt;

  attribute float aSeed;

  varying float vSeed;
  varying float vGlow;
  varying float vNear;

  void main() {
    float t = clamp((uReveal - aSeed * 0.3) / 0.6, 0.0, 1.0);
    float ease = 1.0 - pow(1.0 - t, 4.0);

    vec3 pos = position * uScale;
    float spin = uTime * 0.055 * (1.25 - length(position) * 0.35);
    float cs = cos(spin);
    float sn = sin(spin);
    pos = vec3(pos.x * cs - pos.z * sn, pos.y, pos.x * sn + pos.z * cs);
    pos *= mix(0.15, 1.0, ease);

    // Each node breathes on its own clock.
    float breath = 0.5 + 0.5 * sin(uTime * (0.7 + aSeed * 0.9) + aSeed * 12.0);

    // Proximity lift: nodes nearest the pointer swell and brighten, which is
    // what makes the core feel touchable rather than pre-rendered.
    float pd = distance(uPointer, pos);
    vNear = falloff(0.0, 1.1, pd) * uPointerAmt;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    vSeed = aSeed;
    vGlow = ease * (0.45 + breath * 0.55) + uPulse * 1.2 + vNear * 2.2;

    float ps = uSize * (0.7 + aSeed * 0.6) * (1.0 + vNear * 1.8 + uPulse * 0.9);
    gl_PointSize = clamp(ps * (11.0 / max(0.001, -mv.z)) * uDpr, 0.0, 34.0) * ease;
  }
`;

export const nodesFragment = GLSL_PRELUDE + /* glsl */ `
  precision highp float;

  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform float uOpacity;

  varying float vSeed;
  varying float vGlow;
  varying float vNear;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv) * 2.0;
    if (d > 1.0) discard;

    float core = pow(1.0 - d, 6.0);
    float halo = pow(1.0 - d, 1.6) * 0.42;

    // A hairline ring gives each node an instrument-panel edge instead of a
    // shapeless blob — it reads as a discrete, addressable thing.
    float ring = falloff(0.0, 0.06, abs(d - 0.62)) * (0.25 + vNear * 0.75);

    float alpha = core + halo + ring * 0.5;

    vec3 col = mix(uColorA, uColorB, vSeed);
    col = mix(col, vec3(1.0), clamp(vNear * 0.7, 0.0, 0.8));
    col *= 0.55 + vGlow;

    gl_FragColor = vec4(col, alpha * uOpacity);
  }
`;

/* ── Nucleus ──────────────────────────────────────────────────────────────── */

export const nucleusVertex = /* glsl */ `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

export const nucleusFragment = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uPulse;
  uniform float uOpacity;
  uniform vec3  uColorA;
  uniform vec3  uColorB;

  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    // Inverted fresnel on a back-facing sphere: the rim lights up and the
    // centre stays void-dark, which gives the core a sense of enclosed volume
    // without any actual volumetric marching.
    float fres = 1.0 - abs(dot(normalize(vNormal), normalize(vViewDir)));
    float rim = pow(fres, 2.6);

    float breathe = 0.85 + 0.15 * sin(uTime * 0.6);
    vec3 col = mix(uColorA, uColorB, rim);

    float a = rim * (0.5 + uPulse * 0.9) * breathe * uOpacity;
    gl_FragColor = vec4(col * (1.0 + uPulse * 1.4), a);
  }
`;

/* ── Ambient dust ─────────────────────────────────────────────────────────── */

export const dustVertex = GLSL_PRELUDE + /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uDpr;
  uniform float uReveal;
  uniform vec2  uPointer;

  attribute float aSeed;

  varying float vSeed;
  varying float vFade;

  void main() {
    vec3 pos = position;

    // Very slow drift on independent axes — motion you notice only if you
    // stare, which is exactly the intent for background dust.
    float ph = aSeed * 6.2831853;
    pos += vec3(
      sin(uTime * 0.06 + ph) * 0.5,
      cos(uTime * 0.045 + ph * 1.3) * 0.42,
      sin(uTime * 0.052 + ph * 0.7) * 0.5
    );

    // Parallax: distant dust shifts less than near dust, so pointer movement
    // separates the layers in depth.
    float depthWeight = clamp(length(position) / 16.0, 0.0, 1.0);
    pos.x += uPointer.x * (0.35 + depthWeight * 1.1);
    pos.y += uPointer.y * (0.28 + depthWeight * 0.9);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    vSeed = aSeed;
    vFade = smoothstep(0.0, 1.0, uReveal) * falloff(6.0, 46.0, -mv.z);

    gl_PointSize = clamp(
      uSize * (0.35 + aSeed * 1.1) * (12.0 / max(0.001, -mv.z)) * uDpr,
      0.0, 6.0
    );
  }
`;

export const dustFragment = /* glsl */ `
  precision highp float;

  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform float uOpacity;

  varying float vSeed;
  varying float vFade;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d2 = dot(uv, uv) * 4.0;
    if (d2 > 1.0) discard;

    float alpha = pow(1.0 - d2, 2.0);
    vec3 col = mix(uColorA, uColorB, vSeed);

    gl_FragColor = vec4(col, alpha * uOpacity * vFade * (0.25 + vSeed * 0.75));
  }
`;
