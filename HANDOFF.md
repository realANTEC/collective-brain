# Continue: Collective Brain

Paste this into a new session to resume.

---

I'm continuing work on **Collective Brain**, an Awwwards-calibre concept site
for a fictional AI whose answers are refined by a living knowledge graph.

- **Repo:** `C:\Users\vansh\OPUS` — clean, `main` in sync with
  https://github.com/realANTEC/collective-brain (public)
- **Read first:** `README.md` (architecture + every trap below in detail),
  `pipeline/README.md` (the four GPU pipelines), `tools/README.md` (QA harnesses)
- **Stack:** Next.js 16, React 19, TypeScript strict, Tailwind v4 (CSS-first
  `@theme`, zero component libraries), three.js + R3F with custom GLSL, Framer
  Motion + GSAP, Lenis
- Dev server: `npm run dev` on :3000. Verify with `npx tsc --noEmit` and
  `npx next build` — both currently pass, all 4 routes static.

## What exists

A 9-section landing page and a layered `/answer` page, both fully built. The
Knowledge Core is a persistent WebGL layer whose positions are **real**: 
3,464,554 English Wikipedia articles embedded on a Modal B200, spherical UMAP,
100,000 points shipped (600KB), 75,000 rendered at high tier. Plus a baked
curl-noise flow field, a GPU-rendered hero loop/poster, and a live RAG answer
service.

## Infrastructure

Modal CLI is authenticated locally as profile `cb`. **Always** prefix commands:

```bash
MODAL_PROFILE=cb PYTHONIOENCODING=utf-8 python -m modal run pipeline/<x>.py
```

- Deployed: `cb-answer-service` (scale-to-zero, free at idle) →
  `https://vanshdeep08kohli--cb-answer-service-answerservice-web.modal.run`
- Volume `cb-cache`: `/core/v2` (embeddings, titles, lengths, assignments,
  sub_idx, sub_dirs), `/core/pos/v1` (93MB position index), `/rag/v1`
- **The Modal credentials were pasted in plaintext in the previous session and
  have been used. They should be rotated.**

## THE IMMEDIATE DECISION

`corePosition` is live in the answer service and `focusCore()` is committed and
verified (`e1533dd`, median aim error 0.000°) — but **nothing calls it yet.**

Measured behaviour of the aim:

```
Napoleon        90-110°  from every science question
photosynthesis     8.1°  from black hole
jet engine        22.2°  from black hole
```

It resolves **broad domains, not topics**. I verified this is the projection,
not the lookup: tightening the neighbour-coherence filter from 60° to 32° moved
photosynthesis/black-hole from 9.8° to 8.1°, and 15-22 of 24 neighbours agree at
either threshold. Spherical UMAP at `n_neighbors=25` optimises local structure
and leaves global arrangement weakly constrained; the corpus is mostly
biography/geography/sport, so all of science sits in one patch.

**Pick one:**

- **(A)** Wire the client flight with honest copy — "the region these sources
  occupy", never "where your concept lives". Cheap, ships today, looks good
  (90°+ swings between a person and a science topic).
- **(B)** First improve the map's global structure (higher `n_neighbors`,
  PCA-seeded init, or a different output metric). ~15 min B200 (~$3) and it
  changes the visual already approved.

## Also open

- **Hero telemetry still reads "8,420,119 knowledge nodes"** against a real
  3,464,554. Making one of four figures true while three stay invented is
  arguably worse than four openly illustrative ones — needs a wording decision,
  not a silent swap. (`src/lib/content.ts`, `TELEMETRY`.)
- **Bigger answer model** (70B on B200) was requested but not started. I'd
  push back: brutal cold starts on a scale-to-zero endpoint, materially more
  cost per question, and 3B already answers in 1.5s warm.
- **The flow field's motion character is verified numerically only**
  (displacement coherence +0.989 at 0.02 separation, 0.00 at 1.6). Never
  confirmed by eye — the browser pane here would not composite.

## Traps that cost hours. Do not rediscover these.

**CSS**
1. Never hand-write `-webkit-backdrop-filter` beside the standard property.
   Lightning CSS keeps only the `-webkit-` form and current Chrome reports
   `CSS.supports('-webkit-backdrop-filter')` as false — every glass surface
   silently loses its blur while gradient and border still apply, so it looks
   plausible.
2. A non-`none` `filter` on an ancestor becomes the containing block for
   `position: fixed` descendants. Framer leaves `filter: blur(0px)` after a
   blur-in entrance, which sized a "full-viewport" scrim to one row.
3. Utility classes lose to Framer's inline styles. Put the effect on a plain
   wrapper; blurring an ancestor covers the subtree.
4. That wrapper's filter also creates a stacking context, so a `z-50` child is
   only ranked *within* it. If the wrapper is `position: static` it paints in
   flow order and later siblings draw over your dropdown.

**GLSL / three**
5. `smoothstep(edge0, edge1, x)` is UB when `edge0 > edge1`. SwiftShader
   returns 0 — the entire core renders black. Use the `falloff()` helper in the
   shared prelude; edges always ascending.
6. A local variable named the same as a prelude function shadows it and every
   call site reports "function name expected".
7. **three captures `material.uniforms` once at program-compile time.** Mutating
   a memo you passed as a prop, or reassigning `.uniforms` after compile, does
   nothing — the scene renders with initial values (`uOpacity: 0`, invisible)
   while everything you can inspect from React looks correct. Resolve the
   material's own object once after mount and write through that.
8. **Rigid vs differential rotation.** The point shell may spin at a
   radius-dependent rate; the concept nodes and their arcs must share
   `STRUCTURAL_SPIN`. An arc spans several radii, so a per-vertex radius term
   shears it apart — invisible for a minute, a "cocoon" of chords by half an
   hour, then additive white blowing out the frame.

**React / motion**
9. Never put `whileInView` on the element that animates `scaleX` from 0. A
   zero-area bounding box can never register as intersecting, so it stays
   collapsed forever — and it resolves on wide viewports while deadlocking on
   narrow ones. Observe the full-width parent, animate children via variants.
10. Never mix `performance.now()` with the rAF timestamp. They share an origin
    but are not ordered; a negative delta inverts decay into unbounded growth.

**GPU / Modal**
11. `render_hero.py` must run on **T4**, not A10G. On T4 the published NVIDIA
    manifests give a working Vulkan loader and ANGLE reaches a real GPU in ~4s;
    on A10G `vulkaninfo` reports no device and every backend fails. Chromium's
    GPU init *waits* rather than errors, so the mismatch cost an unattended hour.
    `pipeline/diagnose_browser.py` re-answers this in 4 bounded minutes.
12. Capture is bound by `ReadPixels` stalls, ~0.6 frames/s at 2880×1620,
    **independent of GPU**. Frame count is the lever, not horsepower.
13. Throughput probes must include the data path, and sampling the head of an
    ordered corpus is biased. My probe predicted 4.7M articles in 8 min from the
    first 60k rows; the real answer was 3.46M, because later Wikipedia rows are
    shorter (keep ratio 74% → 54%).
14. Persist GPU intermediates. The first full run discarded its embeddings, so
    fixing a labelling bug twelve lines downstream cost the whole 9-minute embed
    pass again.
15. Cluster labels: "most central article" fails at scale — a cluster of 103,786
    biology articles was labelled with a leafhopper. Take the ~800 most central,
    then pick the most *prominent* (article length as proxy).

**Shell**
16. Git Bash mangles paths. `MSYS_NO_PATHCONV=1` for `modal volume ls cb-cache /`,
    and `git show origin/main:./file` (the `./`) for `rev:path`. Bit me three
    times, twice looking like a missing file.
17. PowerShell pipes buffer until exit, which hides a hung background job. Use
    Bash + `run_in_background`, and a Monitor whose grep matches *failure*
    signatures too — silence is not success.

## How I work on this

Verify by looking at the artifact, not the exit code — every serious bug this
session reported success. Measure before committing to a long GPU run. When an
estimate is wrong, say so and correct it. Keep the site's honesty framing: all
curated content is explicitly illustrative demo data, and anything real (the
embedding, the live answers) says so precisely.
