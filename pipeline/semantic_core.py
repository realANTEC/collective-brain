"""
Build the Knowledge Core out of real knowledge.

The site ships a core whose node positions come from a Fibonacci sphere: even,
beautiful, and encoding precisely nothing. This pipeline replaces that with a
real semantic map, so the object on screen actually is what the copy claims it
is — a shape that knowledge takes.

    corpus -> GPU embeddings -> PCA -> UMAP(3D) -> sphere fit -> quantise

Outputs (committed to public/core/, ~300KB total):
    points.bin   Int16 xyz for the dense shell, one entry per article
    nodes.json   cluster centroids with a real label per node
    meta.json    provenance: corpus, model, counts, params

Run:  modal run pipeline/semantic_core.py
"""

import json
import modal

GPU = "B200"
CORPUS = "wikimedia/wikipedia"
CORPUS_CONFIG = "20231101.en"       # Full English Wikipedia, 6,407,814 articles
MODEL = "BAAI/bge-small-en-v1.5"    # 384-dim, fast, strong for its size

MIN_CHARS = 1200     # drops stubs; keeps ~74% of English Wikipedia
N_UMAP = 120_000     # stratified subsample the manifold is fitted on
N_POINTS = 100_000   # points shipped to the browser (600KB at Int16 xyz)
N_NODES = 96         # concept nodes = k-means centroids

# Why the whole corpus is embedded when only 100k points ship:
#
#   * the clusters are computed over all of it, so a concept node is the centre
#     of a real region of human knowledge rather than of a lucky sample;
#   * the shipped points are drawn stratified from those clusters, so the map
#     represents the corpus instead of whatever the first N articles were;
#   * and the site's headline figure stops being invented. It said 8,420,119
#     nodes. The real number is measured and put on screen instead.
#
# UMAP is fitted on a subsample rather than all 4.7M: umap-learn is CPU-bound
# and would leave a B200 idle for hours. 120k is far past the point where the
# global structure stops changing, and every shipped point comes from that fit.

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch",
        "transformers",
        "datasets",
        "numpy<2",
        "scikit-learn",
        "umap-learn",
    )
)

app = modal.App("cb-semantic-core", image=image)
cache = modal.Volume.from_name("cb-cache", create_if_missing=True)


@app.function(gpu="B200", timeout=1800, volumes={"/cache": cache})
def scale_probe(sample: int = 60_000):
    """
    Measure before committing to a full-corpus run.

    The hero render taught this the expensive way: a job whose runtime nobody
    measured ran for an hour and produced nothing. So before embedding millions
    of articles, embed a slice, time it, and print what the full run would cost.
    Cheap, bounded, and it turns "should be fine" into a number.
    """
    import time

    import numpy as np
    import torch
    from datasets import load_dataset
    from transformers import AutoModel, AutoTokenizer

    t0 = time.time()
    ds = load_dataset(
        "wikimedia/wikipedia", "20231101.en", split="train", cache_dir="/cache/hf"
    )
    load_seconds = time.time() - t0
    total = len(ds)

    tok = AutoTokenizer.from_pretrained(MODEL, cache_dir="/cache/hf")
    model = AutoModel.from_pretrained(MODEL, cache_dir="/cache/hf").cuda().half().eval()

    rows = ds.select(range(min(sample, total)))
    texts = [f"{t}. {x[:400]}" for t, x in zip(rows["title"], rows["text"])]
    kept = [t for t, x in zip(rows["title"], rows["text"]) if len(x) > 1200]
    keep_ratio = len(kept) / max(1, len(texts))

    batch = 2048
    torch.cuda.synchronize()
    t1 = time.time()
    with torch.inference_mode():
        for i in range(0, len(texts), batch):
            enc = tok(
                texts[i : i + batch], padding=True, truncation=True,
                max_length=128, return_tensors="pt",
            ).to("cuda")
            h = model(**enc).last_hidden_state[:, 0]
            torch.nn.functional.normalize(h.float(), dim=-1)
    torch.cuda.synchronize()
    embed_seconds = time.time() - t1

    rate = len(texts) / embed_seconds
    substantive = int(total * keep_ratio)

    report = {
        "corpusArticles": total,
        "datasetLoadSeconds": round(load_seconds, 1),
        "sampled": len(texts),
        "embedSeconds": round(embed_seconds, 1),
        "docsPerSecond": round(rate),
        "keepRatioOver1200Chars": round(keep_ratio, 3),
        "projectedSubstantive": substantive,
        "projectedEmbedMinutes": round(substantive / rate / 60, 1),
        "embeddingsGiB_fp16": round(substantive * 384 * 2 / 1024**3, 2),
        "vramFreeGiB": round(torch.cuda.mem_get_info()[0] / 1024**3, 1),
    }
    # `modal run file::func` does not echo a return value; print it.
    print("SCALE_PROBE " + json.dumps(report, indent=2), flush=True)
    return report


@app.function(
    gpu=GPU,
    timeout=3600,
    volumes={"/cache": cache},
    # 4.7M x 384 fp16 is 3.4GB, and np.concatenate needs the copy alongside the
    # shards. Plus the dataset's arrow cache and 4.7M titles.
    memory=49152,
    cpu=8.0,
)
def build():
    import numpy as np
    import torch
    from datasets import load_dataset
    from transformers import AutoModel, AutoTokenizer

    # ---- corpus ---------------------------------------------------------
    # Filtered, not truncated. Wikipedia is largely stubs — communes,
    # footballers, single-line species entries — and unfiltered they dominate
    # every cluster, so the core ends up labelled "Bonningues-lès-Calais"
    # instead of anything a reader would recognise as a field of knowledge.
    # Requiring real body text leaves the substantive articles.
    import time

    t_start = time.time()
    print(f"loading {CORPUS}:{CORPUS_CONFIG}", flush=True)
    ds = load_dataset(CORPUS, CORPUS_CONFIG, split="train", cache_dir="/cache/hf")
    print(f"{len(ds)} articles in corpus", flush=True)

    tok = AutoTokenizer.from_pretrained(MODEL, cache_dir="/cache/hf")
    model = AutoModel.from_pretrained(MODEL, cache_dir="/cache/hf").cuda().half().eval()

    # ---- embed ----------------------------------------------------------
    # Streamed in shards. Materialising 4.7M lead paragraphs as Python strings
    # first would cost several GB of host RAM for no reason; the filter, the
    # tokeniser and the GPU all work a shard at a time, and only the fp16
    # embeddings and the titles survive each pass.
    embeds: list[np.ndarray] = []
    titles: list[str] = []
    # Article length, kept as a prominence proxy for labelling. See below.
    lengths: list[int] = []
    SHARD = 200_000
    BATCH = 2048

    with torch.inference_mode():
        for start in range(0, len(ds), SHARD):
            shard = ds[start : start + SHARD]
            keep_titles = []
            keep_texts = []
            keep_lengths = []
            for title, text in zip(shard["title"], shard["text"]):
                if len(text) > MIN_CHARS:
                    keep_titles.append(title)
                    keep_lengths.append(len(text))
                    # Lead paragraph carries the topic; whole articles dilute it.
                    keep_texts.append(f"{title}. {text[:400]}")

            if not keep_texts:
                continue

            block = np.zeros((len(keep_texts), 384), dtype=np.float16)
            for i in range(0, len(keep_texts), BATCH):
                enc = tok(
                    keep_texts[i : i + BATCH],
                    padding=True,
                    truncation=True,
                    max_length=128,
                    return_tensors="pt",
                ).to("cuda")
                # BGE uses the CLS token, then L2-normalises.
                h = model(**enc).last_hidden_state[:, 0]
                h = torch.nn.functional.normalize(h.float(), dim=-1)
                block[i : i + BATCH] = h.half().cpu().numpy()

            embeds.append(block)
            titles.extend(keep_titles)
            lengths.extend(keep_lengths)
            done = start + SHARD
            print(
                f"  {min(done, len(ds))}/{len(ds)} scanned, "
                f"{len(titles)} kept, {time.time() - t_start:.0f}s",
                flush=True,
            )

    out = np.concatenate(embeds, axis=0)
    del embeds
    print(f"embeddings done: {out.shape} in {time.time() - t_start:.0f}s", flush=True)

    # ---- k-means on GPU: concept nodes ----------------------------------
    # Done in the full embedding space, before UMAP, so a "concept" is a real
    # semantic cluster rather than an artefact of the 3D projection — and over
    # the whole corpus, so it is the centre of a real region of knowledge.
    X = torch.from_numpy(out).cuda().float()
    g = torch.Generator(device="cuda").manual_seed(7)
    centroids = X[torch.randperm(X.shape[0], generator=g, device="cuda")[:N_NODES]].clone()

    for _ in range(30):
        # Chunked argmax: the full 4.7M x 96 similarity matrix is only ~1.8GB,
        # but the intermediate from a single matmul over 4.7M rows is not worth
        # risking against whatever else is resident.
        assign = torch.empty(X.shape[0], dtype=torch.long, device="cuda")
        for s in range(0, X.shape[0], 1_000_000):
            e = min(s + 1_000_000, X.shape[0])
            assign[s:e] = (X[s:e] @ centroids.T).argmax(dim=1)

        # One scatter-add rather than 96 boolean-mask gathers. At this row count
        # the masked version dominates the whole run: it walks the full matrix
        # once per cluster per iteration, i.e. ~2900 passes over 6.8GB.
        sums = torch.zeros_like(centroids)
        sums.index_add_(0, assign, X)
        counts = torch.bincount(assign, minlength=N_NODES).clamp(min=1).unsqueeze(1)
        centroids = torch.nn.functional.normalize(sums / counts, dim=-1)

    assign_np = assign.cpu().numpy()

    # ---- label each cluster ----------------------------------------------
    # Most-central-article works when a cluster holds a few hundred curated
    # entries. It fails badly at this scale: a cluster of 103,786 biology
    # articles is centred on an arbitrary average member, and the first run
    # labelled it "Eurymela fenestrata" — a leafhopper. Correct, useless.
    #
    # So: take the most central few hundred, then among those pick the most
    # PROMINENT. English Wikipedia has no pageview or backlink data here, but
    # article length is a strong proxy — major topics get long articles — and
    # it costs one integer per document to keep.
    lengths_np = np.asarray(lengths, dtype=np.int64)
    LABEL_POOL = 800
    labels = []
    for k in range(N_NODES):
        idx = np.where(assign_np == k)[0]
        if len(idx) == 0:
            labels.append("")
            continue
        sims = X[torch.from_numpy(idx).cuda()] @ centroids[k]
        pool = min(LABEL_POOL, len(idx))
        central = idx[torch.topk(sims, pool).indices.cpu().numpy()]
        labels.append(titles[int(central[int(np.argmax(lengths_np[central]))])])
    print("clustering done", flush=True)

    # ---- stratified subsample -------------------------------------------
    # UMAP runs on a subsample because umap-learn is CPU-bound: fitting 4.7M
    # points would leave a B200 idle for hours to no benefit. Sampling is
    # proportional to cluster size rather than uniform over the array, so the
    # manifold that gets fitted is a scale model of the corpus and no field of
    # knowledge is dropped because its articles happened to sort late.
    rng_pick = np.random.default_rng(3)
    per_cluster = [np.where(assign_np == k)[0] for k in range(N_NODES)]
    quota = np.array([len(c) for c in per_cluster], dtype=np.float64)
    quota = np.maximum(1, np.round(quota / quota.sum() * N_UMAP)).astype(int)

    picked = []
    for k, idx in enumerate(per_cluster):
        if len(idx) == 0:
            continue
        take = min(quota[k], len(idx))
        picked.append(rng_pick.choice(idx, size=take, replace=False))
    sub_idx = np.sort(np.concatenate(picked))
    print(f"subsampled {len(sub_idx)} of {X.shape[0]} for the manifold", flush=True)

    sub_assign = assign_np[sub_idx]

    # ---- PCA (GPU) then UMAP to 3D --------------------------------------
    Xs = X[torch.from_numpy(sub_idx).cuda()]
    mean = Xs.mean(0, keepdim=True)
    Xc = Xs - mean
    # 384 dims straight into UMAP is slow and mostly noise; 40 keeps the
    # structure that matters and makes the projection tractable.
    _, _, V = torch.pca_lowrank(Xc, q=40)
    P = (Xc @ V).cpu().numpy()
    print("pca done", flush=True)

    # The full matrix is no longer needed and it is the largest thing resident.
    del X, Xs, Xc
    torch.cuda.empty_cache()

    import umap

    # Embed ONTO the sphere, not into a cube that then gets squashed onto one.
    # UMAP's haversine output metric optimises the layout in spherical
    # coordinates directly, so the manifold covers the whole body. Projecting a
    # Euclidean 3D embedding radially instead leaves large bald patches wherever
    # the cloud happened not to extend, which reads as missing data rather than
    # as structure.
    reducer = umap.UMAP(
        n_components=2,
        output_metric="haversine",
        n_neighbors=25,
        min_dist=0.06,
        metric="cosine",
        random_state=42,
        verbose=True,
    )
    sph = reducer.fit_transform(P).astype(np.float64)
    print("umap done", flush=True)

    # (theta, phi) -> unit vector.
    theta, phi = sph[:, 0], sph[:, 1]
    dirs = np.stack(
        [
            np.sin(theta) * np.cos(phi),
            np.cos(theta),
            np.sin(theta) * np.sin(phi),
        ],
        axis=1,
    )
    dirs /= np.clip(np.linalg.norm(dirs, axis=1, keepdims=True), 1e-9, None)

    # Node centroids as the mean direction of their members. transform() is not
    # defined for a non-Euclidean output metric, and averaging on the sphere is
    # both simpler and guaranteed to land in the same coordinate system.
    # Members here means members *within the subsample*, which is the only set
    # that has a position at all.
    node_dirs = np.zeros((N_NODES, 3))
    for k in range(N_NODES):
        idx = np.where(sub_assign == k)[0]
        if len(idx) == 0:
            continue
        v = dirs[idx].mean(axis=0)
        n = np.linalg.norm(v)
        node_dirs[k] = v / n if n > 1e-9 else dirs[idx[0]]

    # ---- give the shell thickness ----------------------------------------
    # Direction carries all the meaning; radius carries none, so it is free to
    # be used for depth. Most points sit on the luminous shell and a minority
    # fill the interior — without that the body reads as a hollow ornament
    # rather than as something with volume.
    rng_r = np.random.default_rng(5)
    u = rng_r.random(dirs.shape[0])
    jitter = rng_r.random(dirs.shape[0]) * 0.13
    radius = np.where(u > 0.22, 1.00 + jitter, 0.30 + np.power(u, 0.55) * 0.62)
    emb3 = (dirs * radius[:, None]).astype(np.float32)
    nodes3 = (node_dirs * 1.20).astype(np.float32)

    # ---- persist ---------------------------------------------------------
    # Two reasons, both learned the hard way.
    #
    # The first run threw its embeddings away, so fixing the cluster labels —
    # a dozen lines downstream of them — meant paying the entire nine-minute
    # embed pass again. Keeping them makes every later change to clustering,
    # labelling or projection a one-minute job.
    #
    # And the subsample's embeddings paired with its directions ARE the index
    # for turning a question into a place: embed the query, find its nearest
    # neighbours here, average their directions, and that is where on the core
    # the concept lives. No extra model, no second corpus.
    import os

    os.makedirs("/cache/core/v2", exist_ok=True)
    np.save("/cache/core/v2/embeddings.npy", out)
    np.save("/cache/core/v2/lengths.npy", lengths_np.astype(np.int32))
    np.save("/cache/core/v2/assign.npy", assign_np.astype(np.int32))
    np.save("/cache/core/v2/sub_idx.npy", sub_idx.astype(np.int64))
    np.save("/cache/core/v2/sub_dirs.npy", dirs.astype(np.float32))
    with open("/cache/core/v2/titles.json", "w", encoding="utf-8") as fh:
        json.dump(titles, fh, ensure_ascii=False)
    cache.commit()
    print(f"persisted {out.shape[0]} embeddings to /cache/core/v2", flush=True)

    # Keep a deterministic subset for the shell.
    rng = np.random.default_rng(11)
    keep = rng.permutation(emb3.shape[0])[:N_POINTS]
    keep.sort()
    pts = emb3[keep]

    # Int16 at 1/16000 gives ~0.00006 precision over a ±2 range: far finer than
    # a pixel at any camera distance, and half the size of float32.
    SCALE = 16000.0
    q = np.clip(np.round(pts * SCALE), -32768, 32767).astype("<i2")

    nodes = [
        {
            "x": round(float(nodes3[k][0]), 4),
            "y": round(float(nodes3[k][1]), 4),
            "z": round(float(nodes3[k][2]), 4),
            "label": labels[k],
            "size": int((assign_np == k).sum()),
        }
        for k in range(N_NODES)
        if labels[k]
    ]

    meta = {
        "corpus": f"{CORPUS}:{CORPUS_CONFIG}",
        "corpusArticles": len(ds),
        # The figure the site puts on screen. Measured, not chosen.
        "documents": len(titles),
        "manifoldSample": int(len(sub_idx)),
        "model": MODEL,
        "points": int(q.shape[0]),
        "nodes": len(nodes),
        "quantScale": SCALE,
        "gpu": GPU,
        "projection": "PCA(40) -> UMAP(2, cosine, output_metric=haversine)",
        "note": (
            "Positions are a real semantic embedding of English Wikipedia. "
            f"All {len(titles)} substantive articles were embedded and clustered; "
            f"the manifold was fitted on a {len(sub_idx)} stratified subsample "
            f"and {int(q.shape[0])} points ship to the browser."
        ),
    }
    print(json.dumps(meta, indent=2), flush=True)

    return {
        "points": q.tobytes(),
        "nodes": json.dumps(nodes, ensure_ascii=False),
        "meta": json.dumps(meta, indent=2),
    }


@app.local_entrypoint()
def main():
    import pathlib

    res = build.remote()
    out = pathlib.Path("public/core")
    out.mkdir(parents=True, exist_ok=True)
    (out / "points.bin").write_bytes(res["points"])
    (out / "nodes.json").write_text(res["nodes"], encoding="utf-8")
    (out / "meta.json").write_text(res["meta"], encoding="utf-8")
    print(f"wrote {len(res['points'])} bytes of points to {out}")
