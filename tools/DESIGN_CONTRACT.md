# Collective Brain — Design Contract

Project root: `C:\Users\vansh\OPUS`. Source in `src/`. Alias `@/*` -> `./src/*`.

**Before writing anything, read these files.** They are the source of truth and
they already exist:

- `src/app/globals.css` — every design token and custom class
- `src/lib/content.ts` — ALL copy and data. Never invent copy that belongs here.
- `src/components/ui/*.tsx` — the primitives you must compose with
- `src/components/sections/hero.tsx` — the exemplar. Match its register exactly.
- `src/lib/motion.ts` — the motion vocabulary
- `src/lib/hooks/index.ts` — available hooks

---

## Design language: "Sediment"

Knowledge settles in luminous layers inside a matte void. Instrument-panel
precise: hairline rules, mono index labels, editorial serif accents, light used
sparingly so that when it appears it reads as signal, not decoration.

References: Linear's restraint, Apple's typographic confidence, Arc's warmth,
Stripe's density. **Never** a generic SaaS landing page.

### Non-negotiables

1. **Dark only.** Background is `bg-void` (#050508). Never a light surface.
2. **One serif accent per heading, maximum.** `<em className="text-accent-lume font-serif italic">`
3. **No emoji anywhere. No rainbow gradients. No neon overload.**
4. **Hairlines, not borders.** `border-line` / `border-line-strong`. Never `border-gray-700`.
5. **Generous whitespace.** Sections use `section-y`, horizontal via `gutter`.
6. **Prose is capped** at `measure` (62ch). Never a full-width paragraph.
7. **Every number in a mono face** with `tnum`.
8. **No arbitrary hex colours.** Use tokens only.
9. Content is a **fictional concept product** — do not add real company names,
   real people, or claims presented as real research findings.

---

## Tailwind tokens (v4 `@theme` — these exact utility names exist)

**Colour** (works with `bg-`, `text-`, `border-`, and `/opacity` modifiers):
`void`, `surface-1`, `surface-2`, `surface-3`, `surface-4`,
`line`, `line-soft`, `line-strong`,
`text-1`, `text-2`, `text-3`, `text-4`  (i.e. `text-text-2`, `bg-text-1`),
`blue`, `blue-soft`, `blue-deep`, `violet`, `violet-soft`, `cyan`, `amber`, `rose`

**Type sizes** (fluid, line-height + tracking baked in):
`text-display`, `text-h1`, `text-h2`, `text-h3`, `text-lead`, `text-body`,
`text-sm`, `text-xs`, `text-label`, `text-micro`

**Families:** `font-sans` (Geist), `font-mono` (Geist Mono), `font-serif` (Instrument Serif)

**Radii:** `rounded-xs sm md lg xl 2xl`

**Easing:** `ease-out-expo`, `ease-out-quint`, `ease-in-out-quint`, `ease-settle`

**Durations:** `duration-fast` (180ms), `duration-base` (420ms), `duration-slow` (900ms)

**Animations:** `animate-breathe`, `animate-drift`, `animate-shimmer`,
`animate-pulse-ring`, `animate-caret`, `animate-scan`, `animate-orbit`

## Custom classes (in globals.css)

`.glass` `.glass-deep` `.glass-specular` `.aurora-ring` `.rule` `.rule-v`
`.label` `.text-lume` `.text-accent-lume` `.grain` `.ring-lume`

## Custom utilities

`gutter` (page side padding) · `section-y` (vertical rhythm) · `measure` (62ch)
`grid-lines` · `mask-fade-x` · `mask-fade-y` · `mask-fade-b` · `gpu` · `tnum`

---

## Primitives — import from `@/components/ui`

```tsx
<SectionShell id="core" index={1} full={false} className="">      // REQUIRED wrapper for every top-level section
<InstrumentLabel index="02">The Knowledge Core</InstrumentLabel>  // mono eyebrow with hairline
<Headline text="One memory," accent="shared." size="h2" />        // accent renders serif italic, same line
<StackedHeadline text="Truth needs" accent="a quorum." />         // accent on its own line
<Lead>Paragraph text</Lead>                                       // lead paragraph at `measure`
<Rule />                                                          // hairline that draws itself in
<Reveal variants={riseIn} delay={0}>…</Reveal>
<StaggerGroup gap={0.06}><StaggerItem>…</StaggerItem></StaggerGroup>
<TextReveal>{line1}{line2}</TextReveal>                           // each CHILD is one clipped line
<Button variant="primary|secondary|ghost" size="sm|md|lg" href="" onClick={} icon={true}>
<GlassCard tilt={5} deep={false}>…</GlassCard>                    // 3D tilt + cursor specular
<GlassPanel deep>…</GlassPanel>                                   // no tilt, for form controls
<ConfidenceMeter value={94} label="Confidence" />                 // segmented bar
<ConfidenceDial value={94} size={116} />                          // radial
<Stat value={7.2} suffix="x" label="…" decimals={1} compact={false} />
<StatusPill tone="merged|contested|rejected|replicated|under review|neutral">
<PulseDot />
<Marquee speed={46} reverse={false}>…</Marquee>
```

## Hooks — `@/lib/hooks`

`usePrefersReducedMotion()` · `useHasPointer()` · `useIsMobile()` · `useMediaQuery(q)`
`useMagnetic(strength, radius)` · `useTilt(maxDeg)` · `useSpecular()`
`useTypewriter(phrases, opts)` · `useCountUp(target, opts)` · `useDriftingValue(base, spread, ms)`
`useScrollLock(bool)` · `useHotkey(match, handler)` · `useDismiss(ref, cb, active)`
`useSceneSnapshot()` -> `{ section, ready, quality }`

## Motion — `@/lib/motion`

`EASE.outExpo|outQuint|inOutQuint|settle` (bezier tuples)
`SPRING_SNAP` `SPRING_SETTLE` `SPRING_MASS` `SPRING_FOLLOW`
`TWEEN_FAST` `TWEEN_BASE` `TWEEN_SLOW`
`VIEWPORT` `VIEWPORT_EARLY` (viewport configs — always `once: true`)
`riseIn` `riseInFlat` `fadeIn` `lineReveal` `assembleIn` `panelIn` `drawX` `drawPath`
`stagger(gap, delay)` `pickVariants(reduced, variants)`

**Always** gate custom motion behind `usePrefersReducedMotion()`.
**Always** use `viewport={VIEWPORT}` (once) for scroll reveals — never replay.

## Scene coupling — `@/lib/scene-state`

`import { scene, pulseScene } from '@/lib/scene-state'`
`pulseScene(1)` fires a light wave through the WebGL core. Use it on meaningful
commits (submitting a query, casting a vote). Do not use it on hover.

Read `scene.scrollProgress` etc. only inside rAF loops, never in render.

---

## Rules that keep this from looking templated

- **Asymmetry.** Do not centre everything. Use 12-column grids with deliberate
  offsets (`lg:col-start-2 lg:col-span-5`). Let content hang off the grid.
- **Index numbers everywhere.** `01 / 02 / 03` in mono, `text-blue-soft/70`.
- **Hairline dividers between cells**, not gaps + rounded cards everywhere.
- **Mix densities.** A section of uniform cards is a template. Combine one large
  editorial block with a dense instrument-style list.
- **Depth via light, not shadow spam.** Glass + a single soft radial glow.
- **Micro-copy in mono uppercase** at `text-label` for anything system-adjacent.

## Technical rules

- `'use client'` at the top of any file using motion, hooks, or state.
- Import icons individually from `lucide-react` (`import { Check } from 'lucide-react'`).
- All content comes from `@/lib/content.ts`. Import the exported consts.
- `cn()` from `@/lib/utils` for class merging.
- Everything must be **responsive**: mobile is a redesign, not a squeeze.
  Mobile should drop the tilt, simplify grids to one column, and keep the
  typographic hierarchy intact.
- Accessibility: real semantic elements, `aria-label` on icon-only controls,
  `aria-hidden` on decorative layers, visible focus (`:focus-visible` is
  already styled globally).
- TypeScript strict. No `any`. No unused imports (the build type-checks).
- Do NOT modify any file outside the ones you are told to create.
- Do NOT run `npm run build` or `next build` (the orchestrator does that).
