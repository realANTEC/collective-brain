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

GPU = "A10G"
CORPUS = "wikimedia/wikipedia"
CORPUS_CONFIG = "20231101.simple"   # Simple English Wikipedia, ~240k articles
MODEL = "BAAI/bge-small-en-v1.5"    # 384-dim, fast, strong for its size

N_DOCS = 60_000      # articles embedded
N_POINTS = 40_000    # points kept for the dense shell
N_NODES = 96         # concept nodes = k-means centroids (matches the high tier)

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


@app.function(gpu=GPU, timeout=3600, volumes={"/cache": cache})
def build():
    import numpy as np
    import torch
    from datasets import load_dataset
    from transformers import AutoModel, AutoTokenizer

    # ---- corpus ---------------------------------------------------------
    # Filtered, not truncated. Simple English Wikipedia is mostly stubs — French
    # communes and footballers with two sentences each — and unfiltered they
    # dominate every cluster, so the core ends up labelled "Bonningues-lès-
    # Calais" instead of anything a reader would recognise as a field of
    # knowledge. Requiring real body text leaves the substantive articles.
    print(f"loading {CORPUS}:{CORPUS_CONFIG}", flush=True)
    # 1200 chars is the knee: strict enough to drop the two-sentence stubs,
    # loose enough to yield ~45k articles so the dense shell keeps the point
    # count the high quality tier is designed around.
    ds = load_dataset(
        CORPUS, CORPUS_CONFIG, split="train[:400000]", cache_dir="/cache/hf"
    )
    ds = ds.filter(lambda r: len(r["text"]) > 1200, num_proc=4)
    print(f"{len(ds)} substantive articles after filtering", flush=True)
    ds = ds.select(range(min(N_DOCS, len(ds))))

    titles = ds["title"]
    # Lead paragraph carries the topic; full articles dilute the embedding.
    texts = [f"{t}. {x[:400]}" for t, x in zip(titles, ds["text"])]
    print(f"{len(texts)} documents", flush=True)

    # ---- embed ----------------------------------------------------------
    tok = AutoTokenizer.from_pretrained(MODEL, cache_dir="/cache/hf")
    model = AutoModel.from_pretrained(MODEL, cache_dir="/cache/hf").cuda().half().eval()

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
            # BGE uses the CLS token, then L2-normalises.
            h = model(**enc).last_hidden_state[:, 0]
            h = torch.nn.functional.normalize(h.float(), dim=-1)
            out[i : i + batch] = h.cpu().numpy()
            if i % (batch * 20) == 0:
                print(f"  embedded {i}/{len(texts)}", flush=True)

    print("embeddings done", flush=True)

    # ---- k-means on GPU: concept nodes ----------------------------------
    # Done in the full embedding space, before UMAP, so a "concept" is a real
    # semantic cluster rather than an artefact of the 3D projection.
    X = torch.from_numpy(out).cuda()
    g = torch.Generator(device="cuda").manual_seed(7)
    centroids = X[torch.randperm(X.shape[0], generator=g, device="cuda")[:N_NODES]].clone()
    for it in range(40):
        sim = X @ centroids.T                      # cosine, vectors are unit norm
        assign = sim.argmax(dim=1)
        for k in range(N_NODES):
            members = X[assign == k]
            if members.shape[0] > 0:
                centroids[k] = torch.nn.functional.normalize(
                    members.mean(0), dim=-1
                )
    assign_np = assign.cpu().numpy()

    # Label each cluster with the title of its most central article.
    labels = []
    for k in range(N_NODES):
        idx = np.where(assign_np == k)[0]
        if len(idx) == 0:
            labels.append("")
            continue
        sub = X[idx] @ centroids[k]
        labels.append(titles[int(idx[int(sub.argmax())])])
    print("clustering done", flush=True)

    # ---- PCA (GPU) then UMAP to 3D --------------------------------------
    Xc = X - X.mean(0, keepdim=True)
    # 384 dims straight into UMAP is slow and mostly noise; 40 keeps the
    # structure that matters and makes the projection tractable.
    _, _, V = torch.pca_lowrank(Xc, q=40)
    P = (Xc @ V).cpu().numpy()
    Pc = (centroids - X.mean(0, keepdim=True)) @ V
    Pc = Pc.cpu().numpy()
    print("pca done", flush=True)

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
    node_dirs = np.zeros((N_NODES, 3))
    for k in range(N_NODES):
        idx = np.where(assign_np == k)[0]
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
        "documents": len(texts),
        "model": MODEL,
        "points": int(q.shape[0]),
        "nodes": len(nodes),
        "quantScale": SCALE,
        "projection": "PCA(40) -> UMAP(3, cosine, n_neighbors=25)",
        "note": "Positions are a real semantic embedding of Simple English Wikipedia.",
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
