"""
Make the search stop being a prop.

The site's answer surface ships written demo content. This pipeline stands up a
service that answers for real, retrieving over the *same* embedding the
Knowledge Core is built from — so the citations name Wikipedia articles that
actually exist and actually contain the sentence being cited, rather than
invented ones.

    question -> bge query vector -> cosine top-k over 47,725 article
    embeddings -> Qwen2.5-3B-Instruct reads the retrieved leads -> JSON

Two entry points:

    modal run    pipeline/answer_service.py    build + persist the retrieval index
    modal deploy pipeline/answer_service.py    serve POST /ask

The index is written to the "cb-cache" volume that semantic_core.py already
uses, in the same corpus order that pipeline produces, so a retrieved source
carries the index of the article whose embedding also placed a point in the
core. Nothing here mutates what semantic_core.py writes.

Honesty note, because it matters for this project: the *answer text* is
generated live by a 3B model and is exactly as reliable as that implies. The
*sources* are real. The response says which is which, and the site's framing —
that its curated content is illustrative demo data — is untouched by this.
"""

import json
import modal

GPU = "A10G"

# Mirrors semantic_core.py exactly. The recipe is the contract: same corpus,
# same filter, same lead-truncation, same model, same pooling. Change any of
# them and the retrieval index stops being the space the core was built in.
CORPUS = "wikimedia/wikipedia"
CORPUS_CONFIG = "20231101.simple"
EMBED_MODEL = "BAAI/bge-small-en-v1.5"
SCAN = 400_000          # rows of the corpus considered
N_DOCS = 60_000         # ceiling on substantive articles kept
LEAD_CHARS = 400        # what gets embedded, per semantic_core.py

LLM = "Qwen/Qwen2.5-3B-Instruct"

# What the reader gets to see, which is longer than what gets embedded — a
# 400-char lead is enough to place an article in the semantic map but not
# always enough to answer from.
STORE_CHARS = 700

INDEX_TAG = "v1"
INDEX_ROOT = "/cache/rag"

# Where a question lands on the core.
#
# semantic_core.py persists the manifold's subsample: the embeddings it was
# fitted on and the 3D direction each one ended up at. Those two arrays are all
# that is needed to turn a question into a place — embed it, find its nearest
# neighbours among the positioned articles, average their directions. No second
# model and no second corpus.
#
# Compacted into its own index rather than read from /core/v2 directly: that
# directory holds the full 3.46M x 384 matrix at 2.7GB, and a scale-to-zero
# service should not pull that across on every cold start to use 3% of it.
CORE_ROOT = "/cache/core"
CORE_SRC = f"{CORE_ROOT}/v2"
POS_ROOT = f"{CORE_ROOT}/pos"
POS_TAG = "v1"
# Neighbours averaged to place a query. Too few and the aim jitters between
# adjacent articles; too many and every question drifts toward the centroid of
# the whole map.
LOCATE_K = 24
# Minimum cosine between a neighbour's direction and the top match's before it
# is allowed to vote. Roughly 32 degrees. Guards against a wide neighbour spread
# normalising toward the cloud's centroid instead of the match's region.
#
# WHAT THIS DOES NOT FIX, measured rather than assumed. Tightening this from
# 0.5 to 0.85 moved "photosynthesis" and "black hole" from 9.8 degrees apart to
# 8.1 — because 15-22 of the 24 neighbours agree at either threshold. The
# neighbours are not the problem: the projection genuinely places those topics
# eight degrees apart.
#
# That is a property of the map, not a bug here. Spherical UMAP at
# n_neighbors=25 optimises local structure and leaves global arrangement weakly
# constrained, and the corpus is mostly biography, geography and sport — so all
# of science occupies one small patch of the sphere and everything technical
# lands in it. Napoleon sits 90-110 degrees from every science question; jet
# engines sit 22 degrees from black holes.
#
# So the aim resolves BROAD DOMAINS, not individual topics, and anything built
# on it should say that rather than imply it flies to a concept.
LOCATE_COHERENCE = 0.85

TOP_K = 4               # passages handed to the model
POOL = 16               # candidates considered before de-duplication
MAX_NEW_TOKENS = 220

# Cosine window used to turn retrieval similarity into a 0-1 number. bge-small
# with the query instruction puts unrelated pairs around 0.60 and strong hits
# around 0.85; below the floor the corpus almost certainly does not cover the
# question. Uncalibrated by construction — see `confidenceBasis` in the payload.
SIM_FLOOR = 0.62
SIM_CEIL = 0.86

QUERY_INSTRUCTION = "Represent this sentence for searching relevant passages: "

SYSTEM_PROMPT = (
    "You answer strictly from the numbered passages you are given.\n"
    "Rules:\n"
    "1. Every sentence that states a fact ends with the bracketed number of the "
    "passage it came from, like [1] or [2][3]. A sentence with no supporting "
    "passage does not belong in the answer.\n"
    "2. If the passages do not contain the answer, say that plainly in one "
    "sentence and stop — never fill the gap from memory, and cite nothing.\n"
    "3. Three to five sentences. No preamble, no headings, no bullet lists."
)

NOTICE = (
    "Answer generated live by Qwen2.5-3B-Instruct from Simple English Wikipedia "
    "passages retrieved with BAAI/bge-small-en-v1.5. The cited titles are real "
    "articles; the prose is model output and unverified. The curated content "
    "elsewhere on Collective Brain remains illustrative demo data."
)


def _fetch_weights():
    """Bake both models into the image layer.

    They could live on the volume next to the index, but a cold container then
    pulls ~6.5GB over the volume mount before it can answer anything. Image
    layers are cached on the worker, so this moves that cost to build time and
    off the request path.
    """
    from huggingface_hub import snapshot_download

    snapshot_download(
        LLM,
        local_dir="/models/llm",
        ignore_patterns=["*.pt", "*.bin", "*.msgpack", "*.h5", "original/*"],
    )
    snapshot_download(
        EMBED_MODEL,
        local_dir="/models/embed",
        ignore_patterns=["*.bin", "*.onnx", "*.msgpack", "*.h5", "openvino*"],
    )


base_image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "torch",
    "transformers",
    "accelerate",
    "datasets",
    "numpy<2",
    "fastapi[standard]",
    "huggingface_hub[hf_transfer]",
)

image = base_image.env({"HF_HUB_ENABLE_HF_TRANSFER": "1"}).run_function(_fetch_weights)

app = modal.App("cb-answer-service", image=image)
cache = modal.Volume.from_name("cb-cache", create_if_missing=True)


# ══════════════════════════════════════════════════════════════════════════
#  INDEX
# ══════════════════════════════════════════════════════════════════════════


@app.function(gpu=GPU, timeout=3600, volumes={"/cache": cache})
def build_index(scan: int = SCAN, n_docs: int = N_DOCS, tag: str = INDEX_TAG):
    """Embed the corpus and persist vectors + titles + leads to the volume.

    semantic_core.py throws its embeddings away once it has positions; the
    service needs them back, so this recomputes them rather than editing that
    pipeline. Roughly two minutes of A10G for the full 47.7k.
    """
    import os
    import numpy as np
    import torch
    from datasets import load_dataset
    from transformers import AutoModel, AutoTokenizer

    print(f"loading {CORPUS}:{CORPUS_CONFIG} [:{scan}]", flush=True)
    ds = load_dataset(
        CORPUS, CORPUS_CONFIG, split=f"train[:{scan}]", cache_dir="/cache/hf"
    )
    ds = ds.filter(lambda r: len(r["text"]) > 1200, num_proc=4)
    print(f"{len(ds)} substantive articles after filtering", flush=True)
    ds = ds.select(range(min(n_docs, len(ds))))

    titles = ds["title"]
    raw = ds["text"]
    texts = [f"{t}. {x[:LEAD_CHARS]}" for t, x in zip(titles, raw)]

    tok = AutoTokenizer.from_pretrained("/models/embed")
    model = AutoModel.from_pretrained("/models/embed").cuda().half().eval()

    out = np.zeros((len(texts), 384), dtype=np.float32)
    batch = 512
    with torch.inference_mode():
        for i in range(0, len(texts), batch):
            enc = tok(
                texts[i : i + batch],
                padding=True,
                truncation=True,
                max_length=128,
                return_tensors="pt",
            ).to("cuda")
            h = model(**enc).last_hidden_state[:, 0]
            h = torch.nn.functional.normalize(h.float(), dim=-1)
            out[i : i + batch] = h.cpu().numpy()
            if i % (batch * 20) == 0:
                print(f"  embedded {i}/{len(texts)}", flush=True)

    docs = [
        {"t": t, "s": " ".join(x[:STORE_CHARS].split())}
        for t, x in zip(titles, raw)
    ]

    dest = os.path.join(INDEX_ROOT, tag)
    os.makedirs(dest, exist_ok=True)
    # fp16 halves the file and costs nothing: these are unit vectors read back
    # into a fp16 matmul anyway.
    np.save(os.path.join(dest, "embeddings.npy"), out.astype(np.float16))
    with open(os.path.join(dest, "docs.json"), "w", encoding="utf-8") as f:
        json.dump(docs, f, ensure_ascii=False)

    meta = {
        "corpus": f"{CORPUS}:{CORPUS_CONFIG}",
        "documents": len(docs),
        "embedModel": EMBED_MODEL,
        "llm": LLM,
        "dim": 384,
        "leadChars": LEAD_CHARS,
        "storeChars": STORE_CHARS,
        "order": (
            "Same filtered corpus ordering semantic_core.py embeds "
            "(scan -> len(text)>1200 -> first N). Row i here is the article "
            "whose embedding produced core position i, before that pipeline's "
            "40k shell subsample."
        ),
    }
    with open(os.path.join(dest, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    cache.commit()

    sizes = {
        p: os.path.getsize(os.path.join(dest, p))
        for p in ("embeddings.npy", "docs.json", "meta.json")
    }
    print(json.dumps({**meta, "bytes": sizes}, indent=2), flush=True)
    return {**meta, "bytes": sizes, "path": dest}


# ══════════════════════════════════════════════════════════════════════════
#  SERVICE
# ══════════════════════════════════════════════════════════════════════════


@app.function(timeout=1800, volumes={"/cache": cache}, memory=32768, cpu=4.0)
def build_position_index(tag: str = POS_TAG):
    """
    Compact the manifold subsample into a standalone position index.

    Reads the artifacts semantic_core.py persisted, keeps only the rows that
    actually have a position, and writes ~92MB the service can load in a second
    instead of the 2.7GB full matrix.
    """
    import json as _json
    import os

    import numpy as np

    sub_idx = np.load(f"{CORE_SRC}/sub_idx.npy")
    dirs = np.load(f"{CORE_SRC}/sub_dirs.npy").astype(np.float32)
    # mmap: only the subsample's rows are ever touched, and materialising the
    # whole matrix to slice 3% of it would need 2.7GB of resident memory.
    emb = np.load(f"{CORE_SRC}/embeddings.npy", mmap_mode="r")
    titles = _json.load(open(f"{CORE_SRC}/titles.json", encoding="utf-8"))

    if len(sub_idx) != dirs.shape[0]:
        raise RuntimeError(
            f"subsample/direction mismatch: {len(sub_idx)} vs {dirs.shape[0]}"
        )

    sub_emb = np.ascontiguousarray(emb[sub_idx]).astype(np.float16)
    sub_titles = [titles[int(i)] for i in sub_idx]

    out = f"{POS_ROOT}/{tag}"
    os.makedirs(out, exist_ok=True)
    np.save(f"{out}/emb.npy", sub_emb)
    np.save(f"{out}/dirs.npy", dirs)
    with open(f"{out}/titles.json", "w", encoding="utf-8") as fh:
        _json.dump(sub_titles, fh, ensure_ascii=False)
    with open(f"{out}/meta.json", "w", encoding="utf-8") as fh:
        _json.dump(
            {
                "positioned": int(sub_emb.shape[0]),
                "dim": int(sub_emb.shape[1]),
                "source": CORE_SRC,
                "embedModel": EMBED_MODEL,
            },
            fh,
            indent=2,
        )
    cache.commit()

    report = {
        "positioned": int(sub_emb.shape[0]),
        "bytes": int(sub_emb.nbytes + dirs.nbytes),
        "path": out,
    }
    print("POSITION_INDEX " + _json.dumps(report, indent=2), flush=True)
    return report


@app.cls(
    gpu=GPU,
    volumes={"/cache": cache},
    # No min_containers: idle costs nothing. A cold start is ~40s (6.2GB of
    # weights onto the card), which is the price of that.
    scaledown_window=60,
    timeout=300,
    max_containers=1,
)
@modal.concurrent(max_inputs=4)
class AnswerService:
    @modal.enter()
    def load(self):
        import numpy as np
        import torch
        from transformers import AutoModel, AutoModelForCausalLM, AutoTokenizer

        self.ready = False
        self.torch = torch

        try:
            root = f"{INDEX_ROOT}/{INDEX_TAG}"
            self.meta = json.load(open(f"{root}/meta.json", encoding="utf-8"))
            self.docs = json.load(open(f"{root}/docs.json", encoding="utf-8"))
            mat = np.load(f"{root}/embeddings.npy")
            self.emb = torch.from_numpy(mat).cuda().half()
            self.ready = len(self.docs) == self.emb.shape[0] and len(self.docs) > 0
        except Exception as exc:  # index missing -> the endpoint 503s, honestly
            print(f"index unavailable: {exc}", flush=True)
            self.meta, self.docs, self.emb = {}, [], None

        # Position index. Optional: without it the service answers exactly as
        # before and simply reports no location, rather than 503ing over a
        # feature that is decoration on top of the answer.
        try:
            root = f"{POS_ROOT}/{POS_TAG}"
            self.pos_titles = json.load(open(f"{root}/titles.json", encoding="utf-8"))
            self.pos_emb = torch.from_numpy(np.load(f"{root}/emb.npy")).cuda().half()
            self.pos_dirs = torch.from_numpy(np.load(f"{root}/dirs.npy")).cuda().float()
            self.pos_ready = (
                self.pos_emb.shape[0] == self.pos_dirs.shape[0] == len(self.pos_titles)
            )
        except Exception as exc:  # noqa: BLE001
            print(f"position index unavailable: {exc}", flush=True)
            self.pos_emb = self.pos_dirs = None
            self.pos_titles = []
            self.pos_ready = False

        self.etok = AutoTokenizer.from_pretrained("/models/embed")
        self.emodel = AutoModel.from_pretrained("/models/embed").cuda().half().eval()

        self.ltok = AutoTokenizer.from_pretrained("/models/llm")
        # `dtype` here, not `torch_dtype` — the latter is gone in transformers 5.
        self.llm = AutoModelForCausalLM.from_pretrained(
            "/models/llm", dtype=torch.bfloat16, device_map="cuda"
        ).eval()
        print(f"loaded: {len(self.docs)} docs, ready={self.ready}", flush=True)

    def _retrieve(self, question: str, k: int):
        torch = self.torch
        enc = self.etok(
            QUERY_INSTRUCTION + question,
            truncation=True,
            max_length=128,
            return_tensors="pt",
        ).to("cuda")
        with torch.inference_mode():
            q = self.emodel(**enc).last_hidden_state[:, 0]
            q = torch.nn.functional.normalize(q.float(), dim=-1).half()
            sims = (self.emb @ q.T).squeeze(1).float()
            top = torch.topk(sims, min(POOL, sims.shape[0]))

        # Simple English Wikipedia carries families of near-identical stubs
        # ("List of X", "X (disambiguation)"). Without a title-level de-dup the
        # four passages are frequently four views of one article, which makes
        # the citation list look padded.
        picked, seen = [], set()
        for score, idx in zip(top.values.tolist(), top.indices.tolist()):
            doc = self.docs[idx]
            key = doc["t"].split("(")[0].strip().lower()
            if key in seen:
                continue
            seen.add(key)
            picked.append({"index": idx, "score": score, **doc})
            if len(picked) >= k:
                break
        # The query vector goes back too: locating the question on the core
        # reuses it, and embedding the same string twice would double the only
        # part of the request that is not the language model.
        return picked, q

    def _locate(self, q):
        """
        Where on the core does this question live?

        Cosine against the positioned articles, then a similarity-weighted mean
        of their directions. Weighting matters: an unweighted mean lets the
        24th neighbour pull as hard as the 1st, and questions that straddle two
        regions end up aimed at the empty space between them.
        """
        if not self.pos_ready:
            return None, None

        torch = self.torch
        with torch.inference_mode():
            sims = (self.pos_emb @ q.T).squeeze(1).float()
            top = torch.topk(sims, min(LOCATE_K, sims.shape[0]))

            dirs = self.pos_dirs[top.indices]            # (K, 3)
            anchor = dirs[0]                             # the strongest match
            agree = dirs @ anchor
            keep = agree >= LOCATE_COHERENCE
            keep[0] = True                               # the anchor always votes

            kept_dirs = dirs[keep]
            kept_scores = top.values[keep]

            # Softmax over cosine, sharpened: raw cosines here sit in a narrow
            # band and normalise to almost uniform weights.
            w = torch.softmax(kept_scores * 20.0, dim=0).unsqueeze(1)
            vec = (kept_dirs * w).sum(0)
            norm = torch.linalg.vector_norm(vec)
            if float(norm) < 1e-6:
                return None, None
            vec = (vec / norm).tolist()

            kept_idx = top.indices[keep].tolist()
            kept_vals = kept_scores.tolist()
            voters = int(keep.sum())

        neighbours = [
            {"title": self.pos_titles[i], "score": round(s, 4)}
            for s, i in zip(kept_vals[:6], kept_idx[:6])
        ]
        return [round(v, 5) for v in vec], {
            "neighbours": neighbours,
            "voters": voters,
            "considered": int(top.indices.shape[0]),
        }

    def _generate(self, question: str, passages):
        torch = self.torch
        context = "\n\n".join(
            f"[{i + 1}] {p['t']}: {p['s']}" for i, p in enumerate(passages)
        )
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Passages:\n{context}\n\nQuestion: {question}"},
        ]
        prompt = self.ltok.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        enc = self.ltok(prompt, return_tensors="pt").to("cuda")

        with torch.inference_mode():
            out = self.llm.generate(
                **enc,
                max_new_tokens=MAX_NEW_TOKENS,
                do_sample=False,
                return_dict_in_generate=True,
                output_scores=True,
                pad_token_id=self.ltok.eos_token_id,
            )

        seq = out.sequences[0][enc.input_ids.shape[1] :]
        text = self.ltok.decode(seq, skip_special_tokens=True).strip()

        # Mean probability of the tokens the model actually chose. Greedy
        # decoding keeps this high by construction, so it is a weak signal —
        # it moves when the model is genuinely unsure, and that is all it is
        # asked to do.
        probs = []
        for step, logits in enumerate(out.scores):
            if step >= seq.shape[0]:
                break
            probs.append(
                float(torch.softmax(logits[0].float(), dim=-1)[seq[step]].item())
            )
        mean_prob = sum(probs) / len(probs) if probs else 0.0
        return text, mean_prob

    def answer(self, question: str, k: int = TOP_K):
        import time

        t0 = time.time()
        passages, qvec = self._retrieve(question, max(1, min(k, 8)))
        core_position, core_detail = self._locate(qvec)
        text, mean_prob = self._generate(question, passages)

        top_sim = passages[0]["score"] if passages else 0.0
        retrieval = (top_sim - SIM_FLOOR) / (SIM_CEIL - SIM_FLOOR)
        retrieval = max(0.0, min(1.0, retrieval))
        grounded = top_sim >= SIM_FLOOR
        confidence = round(0.65 * retrieval + 0.35 * mean_prob, 3)

        return {
            "question": question,
            "answer": text,
            "confidence": confidence,
            "grounded": grounded,
            "sources": [
                {
                    "title": p["t"],
                    "snippet": p["s"][:280].rstrip() + ("…" if len(p["s"]) > 280 else ""),
                    "score": round(p["score"], 4),
                    "corpusIndex": p["index"],
                    "url": "https://simple.wikipedia.org/wiki/"
                    + p["t"].replace(" ", "_"),
                }
                for p in passages
            ],
            "confidenceBasis": (
                f"0.65 * clamp((topCosine - {SIM_FLOOR}) / "
                f"{round(SIM_CEIL - SIM_FLOOR, 2)}) + 0.35 * meanTokenProbability. "
                "A heuristic, not a calibrated probability."
            ),
            # Where this question sits on the rendered core, as a unit vector in
            # the core's own frame — the client hands it straight to focusCore.
            # Null when the position index is absent.
            "corePosition": core_position,
            # The positioned articles that vote determined it. Returned so the
            # aim is explainable rather than a bare triple of numbers, and so
            # the UI can say what it is flying toward.
            "coreNeighbours": (core_detail or {}).get("neighbours", []),
            # How many of the retrieved neighbours agreed on a region. A low
            # ratio means the question straddles the map and the aim is weak.
            "coreAgreement": (
                None
                if not core_detail
                else f"{core_detail['voters']}/{core_detail['considered']}"
            ),
            "model": LLM,
            "retriever": EMBED_MODEL,
            "corpus": self.meta.get("corpus", f"{CORPUS}:{CORPUS_CONFIG}"),
            "documents": len(self.docs),
            "latencyMs": int((time.time() - t0) * 1000),
            "notice": NOTICE,
        }

    @modal.asgi_app()
    def web(self):
        from fastapi import FastAPI
        from fastapi.middleware.cors import CORSMiddleware
        from fastapi.responses import JSONResponse
        from pydantic import BaseModel

        api = FastAPI(title="Collective Brain answer service")
        api.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_methods=["*"],
            allow_headers=["*"],
            allow_credentials=False,
        )

        class Ask(BaseModel):
            question: str
            k: int = TOP_K

        def run(question: str, k: int):
            question = (question or "").strip()
            if not question:
                return JSONResponse({"error": "empty question"}, status_code=400)
            if not self.ready:
                # Fail loud here so the caller can fall back to its own content
                # rather than render a half-answer.
                return JSONResponse(
                    {"error": "index unavailable", "notice": NOTICE}, status_code=503
                )
            return self.answer(question[:400], k)

        @api.get("/")
        def root():
            return {
                "service": "collective-brain-answer",
                "ready": self.ready,
                "documents": len(self.docs),
                "model": LLM,
                "retriever": EMBED_MODEL,
                "corpus": self.meta.get("corpus", f"{CORPUS}:{CORPUS_CONFIG}"),
                "endpoints": {"ask": "POST /ask {question, k?}  |  GET /ask?q="},
                "notice": NOTICE,
            }

        @api.get("/health")
        def health():
            return {"ok": self.ready, "documents": len(self.docs)}

        @api.post("/ask")
        def ask_post(body: Ask):
            return run(body.question, body.k)

        @api.get("/ask")
        def ask_get(q: str = "", k: int = TOP_K):
            return run(q, k)

        return api


@app.local_entrypoint()
def main(scan: int = SCAN, n_docs: int = N_DOCS, tag: str = INDEX_TAG):
    res = build_index.remote(scan=scan, n_docs=n_docs, tag=tag)
    print(json.dumps(res, indent=2))
    print("\nnow: modal deploy pipeline/answer_service.py")
