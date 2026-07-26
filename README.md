# Collective Brain

**The AI that never forgets what humanity learns.**

A concept product site for a system where every conversation contributes to a
living knowledge graph — answers refined continuously by verified corrections,
scientific literature, expert validation and community review.

> All figures, citations, contributors and answer bodies in this project are
> **illustrative demonstration data** for a fictional product. Nothing here
> describes a real study, a real person, or a real measured result.

---

## Running it

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run build
```

Type-check without emitting:

```bash
npm run typecheck
```

---

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript, `strict` |
| Styling | Tailwind CSS v4 — CSS-first `@theme` tokens, zero component libraries |
| 3D | three.js + React Three Fiber + Drei, custom GLSL |
| Post | `@react-three/postprocessing` (bloom, high tier only) |
| Motion | Framer Motion (component motion) + GSAP ScrollTrigger (scroll choreography) |
| Scroll | Lenis |
| Icons | lucide-react |

---

## Architecture

```
src/
├── app/
│   ├── layout.tsx              Fonts, metadata, skip link
│   ├── page.tsx                Landing page composition (Server Component)
│   ├── globals.css             THE DESIGN SYSTEM — tokens, primitives, utilities
│   ├── icon.svg
│   ├── not-found.tsx
│   └── answer/
│       ├── layout.tsx
│       └── page.tsx            The layered answer surface
│
├── components/
│   ├── three/                  The WebGL layer
│   │   ├── index.ts            Dynamic, client-only entry point
│   │   ├── SceneCanvas.tsx     Canvas, quality tiers, fps watchdog, drag surface
│   │   ├── KnowledgeCore.tsx   The core: points, connections, nodes, nucleus, dust
│   │   ├── shaders.ts          All GLSL
│   │   ├── geometry.ts         Deterministic buffer generation
│   │   ├── choreography.ts     Scroll-driven camera keyframes
│   │   └── interaction.ts      Drag-to-rotate, pinch/shift-wheel zoom, inertia
│   │
│   ├── providers/
│   │   ├── smooth-scroll.tsx   Lenis + GSAP on one clock
│   │   ├── pointer-bridge.tsx  Pointer smoothing, impulse decay
│   │   └── section-tracker.tsx IntersectionObserver → active section
│   │
│   ├── ui/                     The design vocabulary (barrel: ui/index.ts)
│   ├── layout/                 Nav, ScrollRail, Footer
│   ├── overlays/               Preloader, CommandPalette, Cursor, Audio, Atmosphere
│   ├── sections/               The nine landing sections
│   ├── search/                 The hero search field
│   └── answer/                 The answer view
│
└── lib/
    ├── content.ts              Every string and datum on the site
    ├── motion.ts               Springs, easings, shared variants
    ├── scene-state.ts          The DOM ↔ WebGL bridge
    ├── utils.ts                Maths, formatting, class merging
    └── hooks/index.ts          Environment, pointer, content-animation hooks
```

---

## The three systems worth understanding

### 1. Scene state — how the DOM talks to WebGL

The 3D scene reacts to scroll, pointer and search interactions every frame.
Routing that through React state would trigger a reconciliation pass per frame
and destroy the frame budget.

`lib/scene-state.ts` owns a **single mutable object**. The DOM side writes to it
(scroll handlers, pointer handlers, the search field); the render loop reads it
inside `useFrame`. Zero re-renders, zero per-frame allocations.

A small `subscribeScene` exists for the handful of components that need to
re-render on *discrete* changes — the active section, the ready flag, the
quality tier. Those fire at section boundaries, not on raw scroll.

### 2. One clock

Three systems need to agree on where the page is: Lenis (which owns the actual
scroll transform), GSAP ScrollTrigger (section choreography), and the WebGL
scene. Three independent rAF loops would drift by a frame or more and produce
visible shear between the 3D layer and the DOM.

`providers/smooth-scroll.tsx` drives everything from GSAP's ticker — Lenis
advances, ScrollTrigger updates from Lenis' scroll event, and the scene
singleton is written in the same pass. `gsap.ticker.lagSmoothing(0)` is required
here: GSAP's lag smoothing can pause the ticker mid-scroll and freeze Lenis for
a frame.

Under `prefers-reduced-motion` Lenis is not instantiated at all — inertial
scrolling is precisely the kind of motion that preference exists to suppress —
and a plain scroll listener feeds the scene instead.

### 3. The Knowledge Core

One canvas for the entire site, fixed behind the document, **never unmounted
between sections**. That continuity is what makes the scroll read as a single
camera move rather than nine separate scenes.

The body is five layers:

| Layer | What it is |
| --- | --- |
| Nucleus | A back-faced icosahedron with an inverted-fresnel shader. Rim lights, centre stays void-dark — volume without volumetric marching. |
| Core points | 6.5k–42k points on a noise-modulated shell plus interior fill. Assembly, wobble, differential rotation, pointer attraction and the search wave are all vertex displacements of one static buffer. |
| Connections | ~220 great-circle arcs as **one** `LineSegments` draw call. Each carries a travelling light packet on its own clock. |
| Concept nodes | The larger, hover-reactive layer. Nodes near the pointer swell and brighten. |
| Dust | Sparse volumetric particles outside the rotating group, parallaxing against it on pointer move. |

**Glow is procedural, not post-processed.** Every point renders a tight bright
core plus a wide low-alpha halo under additive blending, which gives most of
what a bloom pass would for a fraction of the cost. Real bloom is layered on top
only on the `high` tier, and is the first thing dropped.

**Connections are slerped, not chorded.** Straight lines between points on a
sphere cut *through* the body and read as a wireframe cage. Slerping along the
surface with a midpoint bulge makes them wrap it — which is what reads as a
network rather than a polyhedron.

**Camera keyframes use `smoothstep` between anchors**, not linear interpolation.
Smoothstep zeroes the derivative at each keyframe, so the camera decelerates
into every section and accelerates out of it. Linear interpolation produces a
camera that visibly changes direction at each anchor.

**Drag rotates the core, not the camera.** The camera belongs to the scroll
choreography; letting the pointer move it too would give one transform two
authorities. Rotating the object instead means both compose cleanly — you can
spin the core mid-scroll and neither interaction stutters.

**Choreography is driven by section geometry, not scroll percentage.**
`SectionTracker` gives every section an *anchor* — the scroll offset at which it
sits centred — and `scene.sectionFloat` interpolates between anchors. Feeding
the camera a raw 0→1 scroll fraction instead looks correct until you notice the
sections differ in height by a factor of three, at which point keyframe 5 fires
somewhere in the middle of section 3 and the camera is inside the core while a
dense table is on screen.

### Two traps this scene fell into, documented so you don't

**1. `smoothstep` with inverted edges.** Writing a falloff as
`smoothstep(outer, inner, d)` works on most desktop drivers, which implement it
as the raw formula. It is *undefined* per spec when `edge0 > edge1`, and
SwiftShader — Chrome's software renderer, used whenever the GPU is blocklisted —
returns 0. Every falloff in the scene was written that way, so on those machines
`vVis`, `depthFade` and `drawn` all collapsed to zero and the core rendered as a
black rectangle. All falloffs now go through a `falloff(inner, outer, x)` helper
with ascending edges. Note the helper is declared *after* `precision highp
float;` in the shared prelude — a float-typed signature before the precision
statement is rejected by the fragment compiler.

**2. Uniform object identity.** The render loop is built on mutating
`uniforms.core.uTime.value` and trusting the GPU to see it. That only holds if
you mutate the object the material is actually holding. three captures
`material.uniforms` **once**, when the program is first compiled, into its
internal material properties — so reassigning `material.uniforms` afterwards
does not redirect anything, and mutating the object you passed as a prop may be
mutating an orphan. `KnowledgeCore` resolves the live objects from material refs
once after mount and writes through those. Get this wrong and the scene renders
with its initial uniform values (`uOpacity: 0` — invisible) while every value
you can inspect from React looks perfectly correct.

### Three more, on the CSS side

**3. Never hand-write `-webkit-backdrop-filter`.** Declaring it next to the
standard property makes Lightning CSS (Tailwind v4's transformer) deduplicate
the pair against its browser targets and keep *only* the `-webkit-` form. Current
Chrome reports `CSS.supports('-webkit-backdrop-filter', 'blur(2px)')` as `false`,
so the result was that every `.glass` surface on the site rendered with no blur
at all — the gradient and border still applied, which is exactly why it looked
plausible. Declare the standard property alone and let the transformer prefix.

**4. `filter` retargets `position: fixed`.** An element with any non-`none`
filter becomes the containing block for fixed descendants. Framer Motion leaves
`filter: blur(0px)` behind after a blur-in entrance, so a "full-viewport" overlay
rendered inside the hero resolved `inset-0` against the search-field row and
painted as a dark band across it. Full-viewport overlays either portal to
`body` or don't live under an animated ancestor. The hero now dims its own
blocks instead, which is more robust and leaves the WebGL canvas unaffected.

**5. Utility classes lose to Framer's inline styles.** A `blur-[5px]` class on a
`motion.*` node that animates `filter` does nothing — Framer writes
`filter: blur(0px)` inline and inline wins. Put the effect on a plain wrapper;
blurring an ancestor covers the subtree. The same applies to `opacity`.

And the related stacking trap: because that wrapper's `filter` creates a
stacking context, a `z-50` dropdown inside it is only ranked *within* that
context. While the wrapper was `position: static` it painted in flow order and
every later sibling drew over the open panel. It carries `relative z-30` now.

### Debugging the scene

Because the scene deliberately bypasses React, there is no devtools view of it.
Two affordances exist:

- `window.__cbScene` — the live scene-state singleton (development builds only).
- `?quality=high|medium|low` — pins the rendering tier. Without it you get
  whatever your GPU earns you, which makes the high-detail path untestable on
  software renderers and in CI.

---

## Performance

Measured on the production build (`next build && next start`), landing page:

| | |
| --- | --- |
| Initial JS referenced by the server HTML | **951 kB raw / 288 kB gzipped** across 13 chunks |
| Deferred 3D chunk (three + R3F + postprocessing) | **1080 kB**, not referenced in the initial HTML |
| CSS | 91 kB raw |
| Routes | 4, all statically prerendered |

Lighthouse was not run here (no headless-audit tooling in this environment), so
there is no verified score to quote — the numbers above are direct measurements.

- **Nothing 3D is on the critical path.** The WebGL stack loads via
  `dynamic(…, { ssr: false })` from a client module. Every section's HTML streams
  from the server and the hero is interactive before it arrives.

  This is easy to lose by accident. A single static re-export in
  `components/three/index.ts` — `export { CoreDragSurface } from './SceneCanvas'`
  — was enough to pull three.js back into the initial graph and get the whole
  1 MB chunk preloaded from the server HTML, with `dynamic()` still sitting
  there looking correct. If you add an export to that barrel, re-check that the
  big chunk is absent from the HTML.

- **Lenis and GSAP load after first paint too.** Neither changes what renders,
  and together they are ~150 kB; importing them inside the provider's effect
  rather than at module scope keeps them off the critical path.
- **Adaptive quality.** A tier is resolved on mount from core count, device
  memory, pointer coarseness and the WebGL renderer string (software renderers
  are detected and dropped to `low`). Geometry density, DPR ceiling and bloom
  all follow from it.
- **An fps watchdog measures reality.** 90 consecutive frames over budget drops a
  tier. Downgrades are one-way within a session — oscillating between tiers is
  far more noticeable than simply running at the lower one.
- **Frame-rate-independent smoothing.** `damp()` converts smoothing factors
  through the frame delta, so motion feels identical at 60Hz and 144Hz.
- **The render loop allocates nothing.** Scratch vectors and the choreography
  result object are created once and mutated in place.

## Accessibility

- `prefers-reduced-motion` is honoured structurally, not cosmetically: reveals
  become opacity-only, the marquee stops, the custom cursor and preloader
  sequence are skipped, and Lenis is bypassed entirely.
- Keyboard: `/` focuses the question field, `⌘K` / `Ctrl+K` opens the command
  palette, `Escape` dismisses overlays, and a skip link precedes the fixed nav.
- Decorative layers are `aria-hidden`; icon-only controls carry `aria-label`;
  meters expose `role="meter"` with value bounds.
- Focus is visible globally via a styled `:focus-visible` ring.

## Design system

Everything lives in `src/app/globals.css` as Tailwind v4 `@theme` tokens plus a
small set of handcrafted classes (`.glass`, `.aurora-ring`, `.label`,
`.text-lume`, …). There are no component-library imports anywhere in the
project — every surface is built from those primitives.

The language is **"Sediment"**: knowledge settling in luminous layers inside a
matte void. Instrument-panel precision — hairline rules, monospaced index
labels, one editorial serif accent per heading, and light used sparingly enough
that when it appears it reads as signal rather than decoration.
