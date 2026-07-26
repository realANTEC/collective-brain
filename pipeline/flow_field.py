"""
Bake a divergence-free 3D flow field for the core's dense point shell.

The shell used to wobble on three sin() terms with a per-point phase, so every
particle moved on its own clock and the cloud shimmered rather than flowed.
This replaces that with a real curl-noise field — the curl of a 3-component
value-noise potential, which is divergence-free by construction, so the motion
it drives has no sources or sinks anywhere in the volume. Neighbouring points
read almost the same vector, and the shell shears, folds and swirls instead.

    periodic value noise (3 octaves, 3 channels)
      -> potential A
      -> v = curl A          exactly divergence-free under the difference stencil
      -> one global rescale, clip
      -> z-slices tiled into a single 2D atlas PNG

A tiled 2D atlas rather than a WebGL2 3D texture: the atlas loads through the
ordinary texture path, so both the loader and its fallback stay trivial and the
shader needs no sampler3D. The z blend is two fetches and a mix; bilinear in xy
comes free from the sampler.

Output (public/core/flow.png):
    512x512 RGB — 64 z-slices of a 64^3 field laid out in an 8x8 grid,
    xyz encoded in RGB, remapped from [-1,1] to [0,1].

Run:  modal run pipeline/flow_field.py      (from the repo root)
"""

import modal

GPU = "T4"

RES = 64      # voxels per axis
TILES = 8     # z-slices per atlas row / column; TILES^2 must equal RES

# Lattice periods are coprime so the octaves never line up into a visible
# cubic grid — the usual failure mode of value noise on a regular lattice.
# Amplitudes fall faster than 1/L: the curl is a first derivative, so it
# multiplies each octave by its own frequency, and a flat amplitude spectrum
# would come out dominated by the finest octave and read as noise rather than
# as flow.
OCTAVES = ((3, 1.00), (7, 0.34), (13, 0.12))

# Per-component standard deviation of the encoded field. 0.36 puts the clip at
# 2.78 sigma, so ~0.5% of components are clipped — enough headroom that the
# 8-bit range is well used without flattening the tails of the distribution.
SIGMA = 0.36

image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "torch",
    "numpy<2",
    "pillow",
)

app = modal.App("cb-flow-field", image=image)


@app.function(gpu=GPU, timeout=600)
def build():
    import io

    import numpy as np
    import torch
    from PIL import Image

    assert TILES * TILES == RES, "atlas must hold exactly one tile per z-slice"

    dev = "cuda"
    gen = torch.Generator(device=dev).manual_seed(20260727)

    def octave(lattice: int) -> torch.Tensor:
        """One octave of periodic 3D value noise, 3 channels, on a RES^3 grid."""
        lat = torch.rand((3, lattice, lattice, lattice), generator=gen, device=dev)
        lat = lat * 2.0 - 1.0

        coord = torch.arange(RES, device=dev, dtype=torch.float32) * (lattice / RES)
        base = torch.floor(coord)
        f = coord - base
        # Quintic smootherstep. The curl is a first derivative of this, so a
        # cubic (C1) interpolant would leave the *field* only C0 and every
        # lattice cell boundary would show as a crease in the motion.
        w = f * f * f * (f * (f * 6.0 - 15.0) + 10.0)

        i0 = base.long() % lattice
        i1 = (i0 + 1) % lattice

        # Interpolate one axis at a time. The lattice is cubic, so the same
        # index and weight vectors serve all three.
        v = lat[:, i0] * (1.0 - w).view(1, RES, 1, 1) + lat[:, i1] * w.view(1, RES, 1, 1)
        v = v[:, :, i0] * (1.0 - w).view(1, 1, RES, 1) + v[:, :, i1] * w.view(1, 1, RES, 1)
        v = v[:, :, :, i0] * (1.0 - w).view(1, 1, 1, RES) + v[:, :, :, i1] * w.view(1, 1, 1, RES)
        return v

    potential = torch.zeros((3, RES, RES, RES), device=dev)
    for lattice, amp in OCTAVES:
        potential += amp * octave(lattice)
        print(f"  octave lattice={lattice} amp={amp}", flush=True)

    # Central differences with wraparound. torch.roll is what makes the result
    # periodic in all three axes, which is what lets the shader fract() its
    # sample coordinate and lets the z blend wrap from the last slice to the
    # first without a seam.
    h = 1.0 / RES

    def d(t: torch.Tensor, axis: int) -> torch.Tensor:
        return (torch.roll(t, -1, dims=axis) - torch.roll(t, 1, dims=axis)) / (2.0 * h)

    ax, ay, az = potential[0], potential[1], potential[2]
    field = torch.stack(
        [
            d(az, 1) - d(ay, 2),
            d(ax, 2) - d(az, 0),
            d(ay, 0) - d(ax, 1),
        ],
        dim=0,
    )

    # Shift and difference operators commute, so div(curl) is identically zero
    # under this stencil — not approximately. Assert it rather than trust it.
    div = d(field[0], 0) + d(field[1], 1) + d(field[2], 2)
    rel = float(div.abs().max()) / float(field.abs().max())
    print(f"divergence: max |div| / max |v| = {rel:.3e}", flush=True)
    assert rel < 1e-4, "curl is not divergence-free — check the difference stencil"

    # ONE global scale, never per-component: scaling the components
    # independently would reintroduce divergence.
    field = field * (SIGMA / float(field.std()))
    clipped = float((field.abs() > 1.0).float().mean())
    field = field.clamp(-1.0, 1.0)

    sigma = float(field.std())
    mag = float(field.pow(2).sum(dim=0).mean()) ** 0.5   # RMS vector magnitude
    print(
        f"encoded sigma={sigma:.4f}  RMS |v|={mag:.4f}  clipped={clipped * 100:.2f}%",
        flush=True,
    )

    # ---- atlas -----------------------------------------------------------
    # Slice k occupies tile (col = k % TILES, row = k // TILES). Within a tile
    # the image column is x and the image row is y, so the loader uploads with
    # flipY off and uv maps straight onto (x, y).
    q = ((field * 0.5 + 0.5) * 255.0).round().clamp(0, 255).to(torch.uint8)
    vol = q.permute(1, 2, 3, 0).cpu().numpy()          # (x, y, z, c)

    edge = RES * TILES
    atlas = np.zeros((edge, edge, 3), dtype=np.uint8)
    for k in range(RES):
        row, col = divmod(k, TILES)
        atlas[row * RES : (row + 1) * RES, col * RES : (col + 1) * RES] = (
            vol[:, :, k, :].transpose(1, 0, 2)         # (x, y, c) -> (row=y, col=x, c)
        )

    buf = io.BytesIO()
    Image.fromarray(atlas, "RGB").save(buf, format="PNG", optimize=True)
    png = buf.getvalue()

    print(
        f"atlas {edge}x{edge}  {RES} slices  {len(png) / 1024:.1f} KB",
        flush=True,
    )
    return {"png": png, "sigma": sigma, "rms": mag}


@app.local_entrypoint()
def main():
    import pathlib

    res = build.remote()
    out = pathlib.Path("public/core")
    out.mkdir(parents=True, exist_ok=True)
    (out / "flow.png").write_bytes(res["png"])
    print(
        f"wrote {len(res['png'])} bytes to {out / 'flow.png'}  "
        f"(sigma {res['sigma']:.4f}, RMS |v| {res['rms']:.4f})"
    )
