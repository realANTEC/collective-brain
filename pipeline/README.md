# pipeline/

GPU jobs that make the site's claims literal.

Everything the landing page says about itself — that the core is a shape
knowledge takes, that the shell flows, that the search answers — was originally
asserted by copy over decorative geometry. These four Modal apps replace the
assertion with the thing:

| | Produces | GPU | Kind |
| --- | --- | --- | --- |
| `semantic_core.py` | `public/core/points.bin`, `nodes.json`, `meta.json` | A10G | batch |
| `flow_field.py` | `public/core/flow.png` | T4 | batch |
| `render_hero.py` | `public/hero/core-loop.{mp4,webm}`, posters | A10G + CPU | batch |
| `answer_service.py` | a live HTTPS endpoint | A10G | deployed, scales to zero |

The first three are **build-time**: they run once, commit an asset, and cost
nothing afterwards. The fourth is a **service** and is the only one that can
spend money while you are not looking — see [Cost](#cost).

---

## Running any of them

```powershell
$env:MODAL_PROFILE = 'cb'
```

```bash
python -m modal run pipeline/<script>.py      # from the repo root
```

Run from the repo root, always. The local entrypoints write into `public/` by
relative path, so a different working directory silently scatters assets.

Two conventions hold across all four:

- **One shared cache volume, `cb-cache`.** HuggingFace datasets and model
  weights land in `/cache/hf`, so the 240k-article Wikipedia download happens
  once for the whole project rather than once per pipeline.
- **Every runtime asset is optional.** Nothing in `public/` is required for the
  site to work. The loaders fetch, validate, and fall back to the procedural
  path on any failure — `src/components/three/semantic-core.ts` is the reference
  implementation of that contract. A pipeline you never run costs you fidelity,
  never function.

---

## `semantic_core.py` — where the points come from

The core's node positions were a Fibonacci sphere: even, beautiful, and
encoding precisely nothing.

```
corpus -> GPU embeddings -> k-means -> PCA(40) -> UMAP(3D, haversine) -> quantise
```

47,725 substantive Simple English Wikipedia articles (filtered to
`len(text) > 1200` — unfiltered, the corpus is mostly two-sentence stubs about
French communes, and they dominate every cluster) embedded with
`BAAI/bge-small-en-v1.5` at 384 dims, CLS-pooled and L2-normalised.

Two decisions worth keeping:

- **k-means runs in the full 384-dim space, before UMAP**, so a concept node is
  a real semantic cluster rather than an artefact of the 3D projection. Each
  node is labelled with the title of its most central article.
- **UMAP embeds onto the sphere directly** via `output_metric="haversine"`.
  Projecting a Euclidean 3D embedding radially onto a sphere instead leaves bald
  patches wherever the cloud happened not to reach, which reads as missing data
  rather than as structure.

Positions quantise to Int16 at 1/16000 — finer than a pixel at any camera
distance, half the size of float32. `QUANT_SCALE` is duplicated in
`semantic-core.ts` and the two must agree.

**Output:** `points.bin` 240 KB · `nodes.json` 7.9 KB · `meta.json` 324 B

---

## `flow_field.py` — where the motion comes from

The shell used to wobble on three `sin()` terms with a per-point phase, so every
particle moved on its own clock and the cloud shimmered rather than flowed.

```
periodic value noise (3 octaves) -> potential A -> v = curl A -> atlas PNG
```

The curl of a vector potential is divergence-free *by construction* — and under
a central-difference stencil with `torch.roll`, exactly so rather than
approximately, because shift and difference operators commute. The pipeline
asserts `max|div| / max|v| < 1e-4` rather than trusting it. The consequence is
that neighbouring points read almost the same vector, so the shell shears and
folds instead of scintillating.

Two constraints the encoding has to respect:

- **Octave amplitudes fall faster than 1/L.** The curl is a first derivative, so
  it multiplies each octave by its own frequency; a flat amplitude spectrum
  comes out dominated by the finest octave and reads as noise, not flow.
- **One global rescale, never per-component.** Normalising the three components
  independently reintroduces divergence into a field whose entire point is not
  having any.

The output is a 64³ field as 64 z-slices tiled 8×8 into a 512×512 RGB atlas,
not a WebGL2 3D texture — the atlas loads through the ordinary texture path, so
the loader and its fallback stay trivial and the shader needs no `sampler3D`.

**Output:** `flow.png` ~451 KB

---

## `render_hero.py` — the site, filmed

The site had no poster, no OG image, and nothing to show a device that cannot
run the WebGL layer. This renders **the actual page** — not a reconstruction —
in headless Chrome on an NVIDIA container.

```
next build -> next start -> headless Chrome (ANGLE/NVIDIA) -> PNG frames
            -> cross-dissolve -> h264 + vp9 + poster
```

Deterministic frame-at-a-time capture at 1.5× supersample, 1920×1080@60 for 8
seconds, parked at `sectionFloat = 0.75` where the body fills the frame. Nothing
in the scene shares a period, so the loop seam is a 0.7s cross-dissolve rather
than a match cut.

The hard part is proving the GPU is real. Four ANGLE backends are tried in order
(`vulkan`, `gl-egl`, `egl`, `gl`) and the first reporting a non-software
renderer wins; `--disable-software-rasterizer` is deliberate, so a failed GPU
path becomes a loud failure instead of a quiet SwiftShader render that looks
almost right. The Playwright base image is used rather than assembling Chromium
on `debian_slim`, whose shared-library names move across Debian releases.

```bash
python -m modal run pipeline/render_hero.py --probe-only        # GPU check, ~2 min
python -m modal run pipeline/render_hero.py                      # full render
python -m modal run pipeline/render_hero.py --reuse <run-id>     # re-encode, no GPU
```

Frames persist to the `cb-hero-render` volume under a run id, so `--reuse`
re-encodes without paying for the capture again.

**Output:** `core-loop.mp4`, `core-loop.webm`, `core-poster.jpg`,
`core-og.jpg`, `meta.json` — into `public/hero/`.

---

## `answer_service.py` — the search, answering

The other three are batch jobs. This one is a deployed service, and it is the
reason the search field can stop being a prop.

```
question -> bge query vector -> cosine top-k over 47,725 article embeddings
         -> Qwen2.5-3B-Instruct reads the retrieved leads -> JSON
```

### Why it retrieves over the core's own embedding

The citations have to be real, and the cheapest way to guarantee that is to
retrieve from a corpus that exists. This pipeline re-embeds the corpus with the
**identical recipe** `semantic_core.py` uses — same scan window, same
`len(text) > 1200` filter, same 400-char lead truncation, same model, same CLS
pooling — and persists the vectors that pipeline throws away.

The recipe is the contract. It yields the same 47,725 documents in the same
order, so `sources[].corpusIndex` identifies the article whose embedding also
placed a point in the core. (`points.bin` is a sorted 40k subsample of that
ordering, so the index is not a direct offset into the shipped point buffer —
it identifies the *article*, not the vertex.)

`semantic_core.py` is not modified. The embedding step is duplicated here
instead, which costs ~2 minutes of A10G and keeps the two pipelines
independently runnable.

### Two steps

```bash
python -m modal run pipeline/answer_service.py       # build + persist the index
python -m modal deploy pipeline/answer_service.py    # serve it
```

The index build writes to the shared volume:

```
/cache/rag/v1/embeddings.npy   35.0 MB   float16, 47725 x 384, unit norm
/cache/rag/v1/docs.json        33.4 MB   title + 700-char lead per article
/cache/rag/v1/meta.json           426 B  provenance
```

`build_index` takes `--scan`, `--n-docs` and `--tag`, so a throwaway index for
smoke-testing costs about a minute:

```bash
python -m modal run pipeline/answer_service.py --scan 20000 --n-docs 800 --tag proto
```

### The service

`AnswerService` is a `modal.Cls` on A10G with `scaledown_window=60` and no
`min_containers`, so idle costs nothing. Both models are baked into the image
layer rather than read from the volume — a cold container would otherwise pull
~6.5 GB across a volume mount before it could answer. Measured cold start,
including weight load onto the card, is **~20 s**; warm inference is
**0.8–1.4 s**.

Plain `transformers` rather than vLLM: at batch 1 and 220 max tokens the
generation is not the bottleneck, and vLLM's engine build would add more to the
cold start than it removes from the request.

```
GET  /            service card — model, corpus, document count, readiness
GET  /health
POST /ask         {"question": "...", "k": 4}
GET  /ask?q=...&k=4
```

CORS is `*` on all methods, so a browser can call it directly. If the index is
missing the endpoint returns **503** rather than a half-answer — the caller is
expected to fall back to its own content, the same fail-soft contract the asset
loaders follow.

**Response:**

```json
{
  "question": "How do vaccines work?",
  "answer": "Vaccines work by exposing the immune system to a harmless form of a virus or bacteria… [1]",
  "confidence": 0.649,
  "grounded": true,
  "sources": [
    {
      "title": "Vaccine",
      "snippet": "A vaccine is a biological preparation. It is given to prevent a specific infectious or malignant disease…",
      "score": 0.7622,
      "corpusIndex": 2766,
      "url": "https://simple.wikipedia.org/wiki/Vaccine"
    }
  ],
  "confidenceBasis": "0.65 * clamp((topCosine - 0.62) / 0.24) + 0.35 * meanTokenProbability. A heuristic, not a calibrated probability.",
  "model": "Qwen/Qwen2.5-3B-Instruct",
  "retriever": "BAAI/bge-small-en-v1.5",
  "corpus": "wikimedia/wikipedia:20231101.simple",
  "documents": 47725,
  "latencyMs": 4836,
  "notice": "…"
}
```

### Confidence is a heuristic and says so

`confidence` is 65% retrieval quality — the top cosine similarity mapped through
a `[0.62, 0.86]` window, which is roughly where `bge-small` puts "unrelated" and
"strong hit" with the query instruction prefix — and 35% the mean probability of
the tokens the model actually chose. Greedy decoding keeps the second term high
by construction, so it is a weak signal that moves only when the model is
genuinely unsure; the retrieval term does the work. Every response carries
`confidenceBasis` stating the formula, because a bare number invites being read
as a calibrated probability, which it is not.

`grounded` is the honest flag: `false` means nothing in the corpus cleared the
similarity floor. Observed behaviour on an unanswerable question —

> *"What is the quarterly revenue of Anthropic in 2031?"* → `confidence: 0.29`,
> `grounded: false`, and the model replies that the passages do not contain the
> information rather than inventing a figure.

### Honesty

The site states throughout that its content is illustrative demo data for a
concept product. This service does not weaken that, and is built so it cannot:

- The **sources are real** — real Simple English Wikipedia titles, real lead
  paragraphs, retrieved rather than authored, each with a live URL you can
  check.
- The **answer is model output** and unverified, and every response says so in
  its `notice` field.
- The system prompt forbids answering from memory when the passages do not
  cover the question, and `grounded: false` reports when that happens.

Real retrieval over a real corpus with a real model is not in tension with the
demo framing. Presenting *invented* citations as genuine would be, which is
exactly what this replaces.

---

## Cost

`semantic_core`, `flow_field` and `render_hero` are one-shot batch jobs: they
terminate, and a committed asset costs nothing to serve.

`answer_service` is deployed and therefore worth being precise about. It holds
**zero containers at idle** — `scaledown_window=60`, no `min_containers`, no
`keep_warm` — so the standing cost of the deployment is nothing, and the first
request after an idle period pays a ~20 s cold start. `max_containers=1` bounds
the worst case to one A10G no matter how much traffic arrives.

To verify, or to take it down:

```bash
python -m modal container list                   # expect no cb-answer-service rows when idle
python -m modal app stop cb-answer-service
```
