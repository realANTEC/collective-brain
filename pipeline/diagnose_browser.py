"""
Find out why the hero render hangs before it ever reports a renderer.

The render run wedged for an hour inside _try_backends in render_hero.py: it
printed "next start is up" and then nothing, never reaching the
"backend=... renderer=..." line. A launch that hangs rather than fails is the
expensive kind, because a GPU container keeps billing while it waits.

Two design points:

  * Every launch attempt runs in its own PROCESS GROUP with a hard timeout, and
    the group is killed on expiry. Chromium spawns a zygote and a GPU process;
    killing only the direct child leaves those alive holding the GPU, which is
    how "it timed out" turns into "it is still running".

  * CPU first. A launch hang that reproduces without a GPU is a container
    problem (shm, sandbox, zygote) and can be debugged for free. Only if CPU is
    clean does this need a GPU, and then the per-backend cap bounds the spend.

Run:
    modal run pipeline/diagnose_browser.py                 # CPU, free
    modal run pipeline/diagnose_browser.py::gpu_t4         # T4, bounded
    modal run pipeline/diagnose_browser.py::gpu_a10g       # A10G, bounded
"""

import json
import modal

PLAYWRIGHT = "1.56.0"

# Same flag sets as render_hero.py, reproduced rather than imported so this
# script stays runnable if that file is mid-edit.
BASE_FLAGS = [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu-sandbox",
    "--ignore-gpu-blocklist",
    "--enable-gpu-rasterization",
    "--enable-unsafe-webgpu",
    "--disable-software-rasterizer",
    "--hide-scrollbars",
    "--mute-audio",
    "--force-color-profile=srgb",
]

BACKENDS = [
    ("angle-vulkan", ["--use-gl=angle", "--use-angle=vulkan",
                      "--enable-features=Vulkan", "--disable-vulkan-surface"]),
    ("angle-gl-egl", ["--use-gl=angle", "--use-angle=gl-egl"]),
    ("egl", ["--use-gl=egl"]),
    ("angle-gl", ["--use-gl=angle", "--use-angle=gl"]),
    # Controls. If plain Chromium also hangs, the GPU flags are innocent.
    ("no-gpu-flags", []),
    ("disable-gpu", ["--disable-gpu"]),
]

PER_BACKEND_TIMEOUT = 45

image = (
    modal.Image.from_registry(
        f"mcr.microsoft.com/playwright:v{PLAYWRIGHT}-noble", add_python="3.11"
    )
    .env({"PLAYWRIGHT_BROWSERS_PATH": "/ms-playwright"})
    .apt_install("vulkan-tools", "procps")
    .pip_install(f"playwright=={PLAYWRIGHT}")
)

app = modal.App("cb-diagnose-browser", image=image)


# The child script. Kept as a string so it can run in a clean interpreter with
# no inherited state, and so a wedged Chromium cannot take the parent with it.
CHILD = r"""
import json, sys
from playwright.sync_api import sync_playwright

args = json.loads(sys.argv[1])
WEBGL_JS = '''() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  if (!gl) return { ok: false, renderer: null };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    ok: true,
    renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'masked',
    vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : 'masked',
    version: gl.getParameter(gl.VERSION),
  };
}'''

with sync_playwright() as p:
    print("STAGE launch", flush=True)
    b = p.chromium.launch(channel="chromium", headless=True, args=args)
    print("STAGE launched", flush=True)
    pg = b.new_page()
    print("STAGE page", flush=True)
    rep = pg.evaluate(WEBGL_JS)
    print("RESULT " + json.dumps(rep), flush=True)
    b.close()
"""


def _attempt(name, flags, timeout):
    """Run one launch in its own process group; kill the group if it wedges."""
    import os
    import signal
    import subprocess
    import tempfile
    import time

    args = BASE_FLAGS + flags
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
        fh.write(CHILD)
        child_path = fh.name

    started = time.time()
    proc = subprocess.Popen(
        ["python", child_path, json.dumps(args)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        start_new_session=True,   # own process group -> killable as a unit
    )

    try:
        out, _ = proc.communicate(timeout=timeout)
        hung = False
    except subprocess.TimeoutExpired:
        # SIGKILL the whole group: the zygote and GPU process are siblings of
        # the python child, not its children, and outlive a plain proc.kill().
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except ProcessLookupError:
            pass
        out, _ = proc.communicate()
        hung = True

    elapsed = round(time.time() - started, 1)
    stages = [l.split(" ", 1)[1] for l in (out or "").splitlines() if l.startswith("STAGE")]
    result = None
    for line in (out or "").splitlines():
        if line.startswith("RESULT "):
            result = json.loads(line[7:])

    return {
        "backend": name,
        "hung": hung,
        "seconds": elapsed,
        "reached": stages[-1] if stages else "nothing",
        "renderer": (result or {}).get("renderer"),
        "webglOk": (result or {}).get("ok"),
        "tail": "\n".join((out or "").strip().splitlines()[-6:])[:600],
    }


def _publish_nvidia_icds() -> dict:
    """
    Copy of render_hero.py's manifest publisher.

    Reproduced rather than imported so this probe isolates one variable: the
    render container hangs WITH these manifests present, and the same container
    without them does not. Duplicating twenty lines is the cost of being able
    to toggle the suspect.
    """
    import glob
    import os

    report: dict = {}
    search = [
        "/usr/lib/x86_64-linux-gnu",
        "/usr/lib64",
        "/usr/local/nvidia/lib64",
        "/usr/local/cuda/compat",
    ]

    def find(pattern: str):
        for directory in search:
            hits = sorted(glob.glob(os.path.join(directory, pattern)))
            if hits:
                return hits[-1]
        return None

    egl = find("libEGL_nvidia.so.*")
    glx = find("libGLX_nvidia.so.*")
    report["libEGL_nvidia"] = egl
    report["libGLX_nvidia"] = glx

    if egl:
        os.makedirs("/usr/share/glvnd/egl_vendor.d", exist_ok=True)
        with open("/usr/share/glvnd/egl_vendor.d/10_nvidia.json", "w") as fh:
            json.dump(
                {"file_format_version": "1.0.0",
                 "ICD": {"library_path": os.path.basename(egl)}}, fh)
        report["egl_manifest"] = True

    if glx:
        os.makedirs("/usr/share/vulkan/icd.d", exist_ok=True)
        with open("/usr/share/vulkan/icd.d/nvidia_icd.json", "w") as fh:
            json.dump(
                {"file_format_version": "1.0.0",
                 "ICD": {"library_path": os.path.basename(glx),
                         "api_version": "1.3.242"}}, fh)
        report["vulkan_manifest"] = True

    return report


def _run_all(label, publish_icds=False):
    import subprocess

    print(f"=== {label} ===", flush=True)
    if publish_icds:
        print("ICDS " + json.dumps(_publish_nvidia_icds()), flush=True)
    env = {
        "nvidia-smi": subprocess.run(
            "nvidia-smi --query-gpu=name --format=csv,noheader",
            shell=True, capture_output=True, text=True,
        ).stdout.strip()
        or "none",
        "vulkaninfo": subprocess.run(
            "vulkaninfo --summary 2>/dev/null | grep -m1 deviceName",
            shell=True, capture_output=True, text=True,
        ).stdout.strip()
        or "none",
        "shm": subprocess.run(
            "df -h /dev/shm | tail -1", shell=True, capture_output=True, text=True
        ).stdout.strip(),
    }
    print("ENV " + json.dumps(env, indent=2), flush=True)

    results = []
    for name, flags in BACKENDS:
        r = _attempt(name, flags, PER_BACKEND_TIMEOUT)
        state = "HUNG" if r["hung"] else ("ok" if r["webglOk"] else "no-webgl")
        print(
            f"  {name:<14} {state:<8} {r['seconds']:>5}s  reached={r['reached']:<9} "
            f"{(r['renderer'] or '')[:60]}",
            flush=True,
        )
        results.append(r)

    return {"label": label, "env": env, "results": results}


@app.function(timeout=900)
def cpu():
    return _run_all("CPU (no GPU attached)")


@app.function(gpu="T4", timeout=900)
def gpu_t4():
    return _run_all("T4")


@app.function(gpu="A10G", timeout=900)
def gpu_a10g():
    return _run_all("A10G")


@app.function(gpu="T4", timeout=900)
def gpu_t4_icds():
    """T4 is what the working probe used; A10G is what the render used."""
    return _run_all("T4 + published NVIDIA ICDs", publish_icds=True)


@app.function(gpu="A10G", timeout=900)
def gpu_a10g_icds():
    """The render container's actual state: NVIDIA manifests published first."""
    return _run_all("A10G + published NVIDIA ICDs", publish_icds=True)


@app.local_entrypoint()
def main():
    report = cpu.remote()
    print(json.dumps(report, indent=2))
