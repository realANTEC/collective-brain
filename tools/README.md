# tools/

Verification harnesses. Not part of the build — they exist because several
classes of bug in this project are invisible to a screenshot, a type-check, or
an exit code, and each one below was written after a real defect got through.

## Setup

These drive the locally installed Chrome through `puppeteer-core`, which is
deliberately **not** a project dependency (the site does not need it):

```bash
npm install --no-save puppeteer-core
```

They assume the dev server is on `:3000` and Chrome at
`C:\Program Files\Google\Chrome\Application\chrome.exe`. Paths inside the
scripts are absolute — edit the `OUT` constant if you move things.

## qa/timewarp.mjs — long-session drift

```bash
node tools/qa/timewarp.mjs 90 16 before connections high
#                          ^speed ^real-seconds ^tag ^section ^quality
```

Patches `performance.now` **and** `requestAnimationFrame` before any app code
runs, so three's clock ages N× faster while rAF still ticks at real 60fps. 16
real seconds ≈ 24 minutes of scene time.

Patching only `performance.now` is wrong and will waste your afternoon: code
that seeds a previous-time from `performance.now()` then advances it from the
rAF timestamp sees the two clocks disagree by the whole warp factor, produces a
negative delta, and inverts every decay in the app. That artefact once looked
exactly like a real runaway-brightness bug.

This is how the connection-arc shear was found and confirmed fixed at 2h46m.

## qa/glass-audit.mjs — structural bug classes

```bash
node tools/qa/glass-audit.mjs http://localhost:3000 390 844 home-mobile openMenu
```

Walks every element and reports:

- `.glass` / `.glass-deep` whose `backdrop-filter` computes to `none`
- `position: fixed` whose containing block was retargeted by an ancestor
  `transform` / `filter` / `will-change` / `contain`
- `position: sticky` trapped inside a scroll container
- translucent overlay panels that let content read through

Run it after any change to the design system or to a fixed/sticky element.

## qa/full-scroll.mjs, qa/mobile-scroll.mjs, qa/shoot.mjs — capture

`full-scroll` walks the landing page section by section. `mobile-scroll` tiles
a whole document into viewport frames, and does two passes: reveals are
`once: true`, so a frame captured without having been scrolled past shows its
content in the hidden state.

## qa/live-answer-test.mjs — the live answer route end to end

Needs `NEXT_PUBLIC_ANSWER_ENDPOINT` set in `.env.local`.

## DESIGN_CONTRACT.md

The design system brief the section components were built against — tokens,
primitives, motion vocabulary, and the rules that keep the thing from looking
templated. Read it before adding a section.

## pipeline/diagnose_browser.py

Lives with the pipelines rather than here because it runs on Modal. Reproduces
the headless-Chrome GPU matrix (CPU / T4 / A10G, with and without published
NVIDIA ICD manifests) with a hard per-backend timeout and process-group kill.
Answers "which accelerator actually gives GPU WebGL" in about four bounded
minutes. The answer is **T4**; A10G reports no Vulkan device in this image.
