"""
Render the Knowledge Core as a cinematic loop — the real scene, on a real GPU.

The site has no poster, no OG image and nothing to show a device that cannot
run the WebGL layer. This renders the actual page in headless Chrome on an
NVIDIA container, one deterministic frame at a time, and encodes the result.

    next build -> next start -> headless Chrome (ANGLE/NVIDIA) -> PNG frames
                -> tail/head cross-dissolve -> h264 + vp9 + poster

Outputs (public/hero/):
    core-loop.mp4    h264, 1920x1080@60, seamless
    core-loop.webm   vp9, same
    core-poster.jpg  1920x1080 still
    core-og.jpg      1200x630 crop for social cards
    meta.json        provenance, including the GPU that rendered it

Run:
    modal run pipeline/render_hero.py --probe     # GPU/WebGL check only, ~2 min
    modal run pipeline/render_hero.py             # full render
    modal run pipeline/render_hero.py --reuse <run-id>   # re-encode, no GPU
"""

from __future__ import annotations

import json
import pathlib
import modal

# ── Composition ───────────────────────────────────────────────────────────────

WIDTH, HEIGHT = 1920, 1080
# 30fps, 6 seconds: 201 frames rather than 522.
#
# Measured on a T4 at the 2880x1620 supersampled buffer, capture runs at
# ~0.6 frames/s — the driver reports "GPU stall due to ReadPixels", so the
# screenshot round-trip dominates, not the scene. 522 frames is 14.5 minutes of
# capture before any encoding, which does not fit the function timeout and
# times out having written nothing.
#
# The subject is a slowly drifting particle field, so halving the temporal
# resolution costs nothing visible, and the supersample stays at 1.5 because
# that is what the spatial quality actually depends on.
FPS = 30
LOOP_SECONDS = 6.0
DISSOLVE_SECONDS = 0.7

# Chrome renders at this multiple of the CSS viewport and everything is
# downsampled once at encode time. The canvas is created with antialias:false —
# additive point sprites do not need MSAA, but the hairline connection arcs do,
# and supersampling is the only anti-aliasing available to us here.
SUPERSAMPLE = 1.5

# Which camera. 0 is the hero anchor, 1 is "The Core"; 0.75 sits three quarters
# of the way between them, where opacity has reached ~0.99, a third of the
# network is drawn and the body fills the frame. See choreography.ts.
SECTION_FLOAT = 0.75

# Preloader failsafe is 2.6s, the wipe 0.6s, the entrance ramp 2.6s on top. The
# scene is in steady state — every damped uniform converged — by about six.
WARMUP_SECONDS = 8.0

# A frame outside the dissolve region, for the still.
POSTER_AT = 0.42

# ~6MB ceiling each at eight seconds, with headroom for the muxer.
MP4_KBPS = 5200
WEBM_KBPS = 4200

PROBE_GPU = "T4"
# T4, not A10G. Measured with pipeline/diagnose_browser.py: on T4 the published
# NVIDIA manifests give a working Vulkan loader (vulkaninfo reports the device)
# and ANGLE comes up on a real GPU in ~4s. On A10G in this same image
# vulkaninfo reports no device at all and every GPU backend fails — so the
# probe was validating the one accelerator the render then did not use, and the
# render had no GPU path to find. This is the difference between an eight-second
# capture and an hour of nothing.
RENDER_GPU = "T4"
NODE_VERSION = "22.12.0"
PLAYWRIGHT = "1.49.1"

LOOP_FRAMES = int(round(LOOP_SECONDS * FPS))
DISSOLVE_FRAMES = int(round(DISSOLVE_SECONDS * FPS))

REPO = pathlib.Path(__file__).resolve().parent.parent

# Excluded from the build context. `pipeline` is in the list deliberately:
# editing this file must not invalidate the layer that runs `npm ci` and
# `next build`.
NOT_SOURCE = (
    "node_modules", ".next", ".git", ".claude", "pipeline", "hero",
    "*.tsbuildinfo", "*.log", "__pycache__", ".venv",
)


def _snapshot(repo: pathlib.Path) -> pathlib.Path:
    """
    Copy the source tree aside before handing it to the image builder.

    Modal hashes the mount as it uploads and aborts the whole run if any file
    changes underneath it. On a repo that anything else might be writing to —
    an editor, a formatter, another agent working in a neighbouring directory —
    that is a coin flip on every build. Copying first makes the build take one
    consistent view of the repo. Content is preserved, so the layer cache still
    hits when nothing has actually changed.
    """
    import shutil
    import tempfile

    dst = pathlib.Path(tempfile.gettempdir()) / "cb-hero-src"
    shutil.rmtree(dst, ignore_errors=True)
    shutil.copytree(repo, dst, ignore=shutil.ignore_patterns(*NOT_SOURCE))
    return dst


SOURCE = _snapshot(REPO) if modal.is_local() else REPO

# ── Chrome ────────────────────────────────────────────────────────────────────

BASE_FLAGS = [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu-sandbox",
    "--ignore-gpu-blocklist",
    "--enable-gpu-rasterization",
    "--enable-unsafe-webgpu",
    # Never let a failed GPU path silently become a software render. Chrome
    # refuses SwiftShader without --enable-unsafe-swiftshader, so leaving that
    # off turns "no GPU" into a loud failure instead of a quiet one.
    "--disable-software-rasterizer",
    "--hide-scrollbars",
    "--mute-audio",
    "--force-color-profile=srgb",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
]

# Tried in order; the first that reports a real GPU wins. Vulkan is ANGLE's
# preferred Linux backend and the one NVIDIA supports best headlessly; the
# desktop-GL paths are there because a driver mount missing the Vulkan ICD can
# still expose EGL.
BACKENDS: list[tuple[str, list[str]]] = [
    (
        "angle-vulkan",
        [
            "--use-gl=angle",
            "--use-angle=vulkan",
            "--enable-features=Vulkan",
            # There is no surface to present to; asking for one fails init.
            "--disable-vulkan-surface",
        ],
    ),
    ("angle-gl-egl", ["--use-gl=angle", "--use-angle=gl-egl"]),
    ("egl", ["--use-gl=egl"]),
    ("angle-gl", ["--use-gl=angle", "--use-angle=gl"]),
]

# ── Images ────────────────────────────────────────────────────────────────────

# The Playwright base image already carries a matching Chromium plus the ~40
# shared libraries it needs. Assembling that on debian_slim by hand is a moving
# target across Debian releases (libasound2 -> libasound2t64 and friends).
browser_image = (
    modal.Image.from_registry(
        f"mcr.microsoft.com/playwright:v{PLAYWRIGHT}-noble", add_python="3.11"
    )
    .env({"PLAYWRIGHT_BROWSERS_PATH": "/ms-playwright"})
    .apt_install("curl", "ca-certificates", "xz-utils", "ffmpeg", "vulkan-tools")
    .pip_install(f"playwright=={PLAYWRIGHT}", "pillow", "numpy<2")
)

render_image = (
    browser_image
    # The base image ships Node 20.x; Next 16 requires ^20.19 || >=22.12.
    .run_commands(
        f"curl -fsSL https://nodejs.org/dist/v{NODE_VERSION}/node-v{NODE_VERSION}-linux-x64.tar.xz -o /tmp/node.tar.xz",
        "mkdir -p /opt/node && tar -xJf /tmp/node.tar.xz -C /opt/node --strip-components=1",
        "ln -sf /opt/node/bin/node /usr/local/bin/node",
        "ln -sf /opt/node/bin/npm /usr/local/bin/npm",
        "ln -sf /opt/node/bin/npx /usr/local/bin/npx",
        "node --version && npm --version",
    )
    .add_local_dir(SOURCE, "/app", copy=True)
    .run_commands(
        "cd /app && npm ci --no-audit --no-fund",
        "cd /app && NODE_ENV=production npx next build",
    )
)

encode_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install("pillow")
)

app = modal.App("cb-hero-render")
store = modal.Volume.from_name("cb-hero-render", create_if_missing=True)

# ── The page-side clock ───────────────────────────────────────────────────────

# Capturing at 60fps in wall-clock time is impossible — a single 2880x1620
# screenshot costs a quarter of a second. So the page gets a virtual clock:
# requestAnimationFrame is queued rather than scheduled, performance.now reads
# the virtual time, and the capture loop advances both by exactly 1/60s per
# frame. Every timing source in the stack (three's Clock, GSAP's ticker, Lenis,
# Framer Motion) reads performance.now, so all of them step in lockstep and the
# recorded motion is exactly what a machine holding a perfect 60fps would show.
#
# It runs in "live" mode first, driven by the real rAF, so the boot sequence and
# the entrance choreography play at normal speed before we take the wheel.
CLOCK_SHIM = """
(() => {
  const realNow = performance.now.bind(performance);
  const realRaf = window.requestAnimationFrame.bind(window);
  const origin = realNow();

  let virt = 0;
  let manual = false;
  let nextId = 1;
  const queue = new Map();

  performance.now = () => virt;

  // The preloader skips itself for returning visitors and calls setReady
  // immediately. That is the same end state as sitting through it, three
  // seconds sooner, and one less full-screen overlay to hide.
  try { window.sessionStorage.setItem('cb:booted', '1'); } catch (e) {}

  function flush() {
    if (queue.size === 0) return 0;
    // Snapshot first: callbacks that schedule another frame must land in the
    // next batch, not this one, or a self-rescheduling loop never terminates.
    const batch = Array.from(queue.values());
    queue.clear();
    for (const cb of batch) {
      try { cb(virt); } catch (err) { console.error('[cbclock]', err); }
    }
    return batch.length;
  }

  window.requestAnimationFrame = (cb) => {
    const id = nextId++;
    queue.set(id, cb);
    return id;
  };
  window.cancelAnimationFrame = (id) => { queue.delete(id); };

  (function pump() {
    if (!manual) { virt = realNow() - origin; flush(); }
    realRaf(pump);
  })();

  window.__cbClock = {
    now: () => virt,
    manual: () => { manual = true; },
    step: (dtMs) => { virt += dtMs; return flush(); },
  };
})();
"""

# visibility:hidden rather than display:none — the section anchors the camera
# choreography is driven from are measured from live layout boxes, and removing
# the sections from flow would move every one of them.
STAGE_JS = """
() => {
  const canvas = document.querySelector('canvas');
  if (!canvas) return { error: 'no canvas' };

  const hidden = [];
  for (const el of Array.from(document.body.children)) {
    if (el.contains(canvas)) continue;
    const cs = getComputedStyle(el);
    const z = parseInt(cs.zIndex, 10);
    // The Atmosphere's two decorative planes (z-0 behind the canvas, z-2 in
    // front of it) are part of the shot: the core is meant to sit inside that
    // fog, not on top of a black rectangle.
    const decorative =
      cs.position === 'fixed' && el.hasAttribute('aria-hidden') &&
      Number.isFinite(z) && z <= 2;
    if (decorative) continue;
    el.style.visibility = 'hidden';
    hidden.push(el.tagName.toLowerCase());
  }

  // CSS animations run on the compositor clock, which the virtual clock cannot
  // reach. Over a capture that takes minutes of wall time for eight seconds of
  // footage the drifting background blobs would strobe across the frame.
  const style = document.createElement('style');
  style.textContent =
    '*,*::before,*::after{animation-play-state:paused!important;transition:none!important}';
  document.head.appendChild(style);

  return { hidden, canvas: [canvas.width, canvas.height] };
}
"""

# Replicates SectionTracker's anchor maths so we can land on an exact
# sectionFloat. Scrolling is the only way in: scene-state's window handle is
# stripped from production builds.
SEEK_JS = """
(target) => {
  const els = Array.from(document.querySelectorAll('[data-section]'));
  if (els.length < 2) return null;
  const vh = window.innerHeight;
  const maxScroll = Math.max(1, document.documentElement.scrollHeight - vh);
  const anchors = els.map((el) => {
    const r = el.getBoundingClientRect();
    const top = r.top + window.scrollY;
    return Math.min(Math.max(top + r.height / 2 - vh / 2, 0), maxScroll);
  });
  for (let i = 1; i < anchors.length; i++) {
    if (anchors[i] <= anchors[i - 1]) anchors[i] = anchors[i - 1] + 1;
  }
  const i = Math.min(anchors.length - 2, Math.max(0, Math.floor(target)));
  const t = Math.min(1, Math.max(0, target - i));
  const y = Math.round(anchors[i] + t * (anchors[i + 1] - anchors[i]));
  window.scrollTo({ top: y, behavior: 'instant' });
  return { y, sections: els.length };
}
"""

WEBGL_JS = """
() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  if (!gl) return { ok: false, reason: 'no webgl context' };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    ok: true,
    renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    version: gl.getParameter(gl.VERSION),
    maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
  };
}
"""


# ── Container-side helpers ────────────────────────────────────────────────────


def _publish_nvidia_icds() -> dict:
    """
    Make the mounted NVIDIA driver visible to the EGL and Vulkan loaders.

    GPU containers get the driver's shared objects but not the JSON manifests
    the loaders discover them through — those are installed by the host's
    graphics stack, which a compute-only container does not inherit. Both
    loaders are purely manifest-driven, so writing the two files by hand is
    enough. If the vendor .so is absent there is nothing to point at, and the
    returned report is what tells us GPU rendering is off the table.
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

    def find(pattern: str) -> str | None:
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
                {
                    "file_format_version": "1.0.0",
                    "ICD": {"library_path": os.path.basename(egl)},
                },
                fh,
            )
        report["egl_manifest"] = True

    if glx:
        # NVIDIA's Vulkan ICD lives inside libGLX_nvidia.so — it is the same
        # object, entered through a different entry point.
        os.makedirs("/usr/share/vulkan/icd.d", exist_ok=True)
        with open("/usr/share/vulkan/icd.d/nvidia_icd.json", "w") as fh:
            json.dump(
                {
                    "file_format_version": "1.0.0",
                    "ICD": {
                        "library_path": os.path.basename(glx),
                        "api_version": "1.3.242",
                    },
                },
                fh,
            )
        report["vulkan_manifest"] = True

    report["existing_icds"] = sorted(glob.glob("/usr/share/vulkan/icd.d/*.json"))
    report["existing_egl_vendors"] = sorted(
        glob.glob("/usr/share/glvnd/egl_vendor.d/*.json")
    )
    return report


def _shell(cmd: str, timeout: int = 60) -> str:
    import subprocess

    try:
        out = subprocess.run(
            cmd, shell=True, capture_output=True, text=True, timeout=timeout
        )
        return (out.stdout + out.stderr).strip()
    except Exception as exc:  # noqa: BLE001 - diagnostics only
        return f"<{exc}>"


def _is_software(renderer: str) -> bool:
    lowered = (renderer or "").lower()
    return any(
        marker in lowered
        for marker in ("swiftshader", "llvmpipe", "softpipe", "software", "lavapipe")
    )


LAUNCH_DEADLINE = 60


class _LaunchTimeout(Exception):
    pass


def _with_deadline(seconds: int, fn):
    """
    Cap a blocking call with SIGALRM.

    Chromium's GPU init can wedge rather than error — on the wrong accelerator
    it waits instead of failing, and a launch that never returns burns the whole
    function timeout. An alarm turns that into an ordinary exception so the loop
    moves on to the next backend.

    Only fires on the main thread; if Modal ever runs this off it, the alarm is
    a no-op and the function timeout is still the backstop.
    """
    import signal

    def _fire(_signum, _frame):
        raise _LaunchTimeout(f"exceeded {seconds}s")

    previous = signal.signal(signal.SIGALRM, _fire)
    signal.alarm(seconds)
    try:
        return fn()
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, previous)


def _try_backends(playwright, extra_args: list[str] | None = None):
    """
    Launch Chromium once per backend and keep the first that reports a real GPU.

    Returns (browser, backend_name, webgl_report). Raises if every backend
    lands on a software rasteriser — a SwiftShader render of this scene is not
    worth shipping, and shipping one quietly would be worse than shipping none.
    """
    attempts = []
    for name, flags in BACKENDS:
        args = BASE_FLAGS + flags + (extra_args or [])
        browser = None
        try:
            browser = _with_deadline(
                LAUNCH_DEADLINE,
                lambda: playwright.chromium.launch(
                    channel="chromium", headless=True, args=args
                ),
            )
            page = browser.new_page()
            report = _with_deadline(LAUNCH_DEADLINE, lambda: page.evaluate(WEBGL_JS))
            page.close()
        except Exception as exc:  # noqa: BLE001
            if browser:
                browser.close()
            attempts.append({"backend": name, "error": str(exc)[:400]})
            print(f"  {name}: launch failed — {str(exc)[:200]}", flush=True)
            continue

        renderer = report.get("renderer", "")
        print(f"  {name}: {renderer}", flush=True)
        attempts.append({"backend": name, **report})

        if report.get("ok") and renderer and not _is_software(renderer):
            report["attempts"] = attempts
            return browser, name, report

        browser.close()

    raise RuntimeError(
        "no GPU-backed WebGL backend available; refusing to ship a software "
        f"render. attempts={json.dumps(attempts, indent=2)}"
    )


# ── Probe ─────────────────────────────────────────────────────────────────────


@app.function(gpu=PROBE_GPU, image=browser_image, timeout=900)
def probe() -> dict:
    """Cheap answer to the only question that matters: is WebGL on the GPU?"""
    from playwright.sync_api import sync_playwright

    icds = _publish_nvidia_icds()
    print(json.dumps(icds, indent=2), flush=True)
    print("--- nvidia-smi ---\n" + _shell("nvidia-smi -L"), flush=True)
    print("--- vulkaninfo ---\n" + _shell("vulkaninfo --summary")[:2500], flush=True)

    with sync_playwright() as playwright:
        try:
            browser, backend, report = _try_backends(playwright)
        except RuntimeError as exc:
            return {"gpu": False, "icds": icds, "detail": str(exc)}

        page = browser.new_page()
        page.goto("chrome://gpu")
        page.wait_for_timeout(1500)
        gpu_page = page.inner_text("body")[:3000]
        browser.close()

    return {
        "gpu": True,
        "backend": backend,
        "webgl": report,
        "icds": icds,
        "chrome_gpu": gpu_page,
    }


# ── Capture ───────────────────────────────────────────────────────────────────


@app.function(
    gpu=RENDER_GPU,
    image=render_image,
    # 20 minutes, not an hour. A capture is ~8 minutes end to end; anything past
    # this is wedged, and the only thing a longer ceiling buys is a larger bill
    # before anyone notices.
    timeout=1200,
    volumes={"/store": store},
    cpu=8.0,
    memory=16384,
)
def capture(run_id: str, section_float: float = SECTION_FLOAT) -> dict:
    import os
    import shutil
    import subprocess
    import time
    import urllib.request

    from playwright.sync_api import sync_playwright

    icds = _publish_nvidia_icds()
    print(json.dumps(icds, indent=2), flush=True)

    # ── serve the production build ────────────────────────────────────────
    env = {**os.environ, "NODE_ENV": "production", "PORT": "3000"}
    server = subprocess.Popen(
        ["npx", "next", "start", "-H", "127.0.0.1", "-p", "3000"],
        cwd="/app",
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    deadline = time.time() + 120
    while True:
        if server.poll() is not None:
            raise RuntimeError(f"next start exited: {server.stdout.read()[-2000:]}")
        try:
            with urllib.request.urlopen("http://127.0.0.1:3000/", timeout=5) as res:
                if res.status == 200:
                    break
        except Exception:  # noqa: BLE001 - polling until it is up
            if time.time() > deadline:
                raise RuntimeError("next start never became reachable")
            time.sleep(1)
    print("next start is up", flush=True)

    frame_dir = f"/tmp/frames/{run_id}"
    os.makedirs(frame_dir, exist_ok=True)
    total = LOOP_FRAMES + DISSOLVE_FRAMES

    try:
        with sync_playwright() as playwright:
            browser, backend, webgl = _try_backends(playwright)
            print(f"backend={backend} renderer={webgl['renderer']}", flush=True)

            context = browser.new_context(
                viewport={"width": WIDTH, "height": HEIGHT},
                device_scale_factor=SUPERSAMPLE,
                color_scheme="dark",
                reduced_motion="no-preference",
            )
            context.add_init_script(CLOCK_SHIM)
            page = context.new_page()
            page.on("pageerror", lambda e: print(f"[page error] {e}", flush=True))
            page.on(
                "console",
                lambda m: (
                    print(f"[console.{m.type}] {m.text}"[:300], flush=True)
                    if m.type in ("error", "warning")
                    else None
                ),
            )

            page.goto(
                "http://127.0.0.1:3000/?quality=high",
                wait_until="networkidle",
                timeout=90_000,
            )
            page.wait_for_selector("canvas", timeout=30_000)

            # Let the entrance play in real time. Every damped uniform in the
            # render loop — opacity, scale, pointer amount, the connection draw
            # — has to converge before the capture starts, or the first second
            # of the loop is a settle that the last second does not match.
            page.wait_for_timeout(int(WARMUP_SECONDS * 1000))

            seek = page.evaluate(SEEK_JS, section_float)
            print(f"seek -> {seek}", flush=True)
            # Lenis re-syncs to the real scroll offset on the next native scroll
            # event; give it a couple of seconds to settle and the choreography
            # to damp into the new keyframe before freezing the clock.
            page.wait_for_timeout(2500)

            staged = page.evaluate(STAGE_JS)
            print(f"staged -> {staged}", flush=True)
            if staged.get("error"):
                raise RuntimeError(staged["error"])

            page.wait_for_timeout(400)

            page.evaluate("() => window.__cbClock.manual()")
            step_ms = 1000.0 / FPS
            # Drain whatever was queued at the moment of the handover so frame 0
            # is a fully rendered frame rather than a partial one.
            for _ in range(4):
                page.evaluate("(dt) => window.__cbClock.step(dt)", step_ms)

            started = time.time()
            for i in range(total):
                page.evaluate("(dt) => window.__cbClock.step(dt)", step_ms)
                page.screenshot(
                    path=f"{frame_dir}/f{i:05d}.png",
                    type="png",
                    scale="device",
                    caret="hide",
                    animations="allow",
                )
                if i % 60 == 0:
                    rate = (i + 1) / max(0.001, time.time() - started)
                    print(f"  frame {i}/{total}  {rate:.1f}/s", flush=True)

            elapsed = time.time() - started
            print(f"captured {total} frames in {elapsed:.0f}s", flush=True)
            context.close()
            browser.close()
    finally:
        server.terminate()

    light = _assert_lit(f"{frame_dir}/f{int(LOOP_FRAMES * POSTER_AT):05d}.png")
    _dissolve(frame_dir)
    stats = _encode_master(frame_dir)

    out = f"/store/{run_id}"
    os.makedirs(out, exist_ok=True)
    shutil.move(f"{frame_dir}/master.mkv", f"{out}/master.mkv")
    shutil.move(f"{frame_dir}/poster.png", f"{out}/poster.png")
    store.commit()

    return {
        "run_id": run_id,
        "backend": backend,
        "renderer": webgl["renderer"],
        "vendor": webgl.get("vendor"),
        "gl_version": webgl.get("version"),
        "frames": LOOP_FRAMES,
        "captured": total,
        "capture_seconds": round(elapsed, 1),
        "seek": seek,
        "canvas": staged.get("canvas"),
        **light,
        **stats,
    }


def _assert_lit(path: str) -> dict:
    """
    A black frame is the failure mode this whole pipeline is most likely to hit
    quietly — a shader that failed to compile, an opacity uniform that never
    left zero, a screenshot taken of a cleared drawing buffer. Every one of them
    encodes into a perfectly valid, perfectly empty video.
    """
    import numpy as np
    from PIL import Image

    arr = np.asarray(Image.open(path).convert("L"), dtype=np.float32)
    mean, peak = float(arr.mean()), float(arr.max())
    print(f"luminance mean={mean:.2f} peak={peak:.0f}", flush=True)
    if peak < 24:
        raise RuntimeError(
            f"captured frames are effectively black (peak={peak}) — the scene "
            "did not render"
        )
    return {"luma_mean": round(mean, 2), "luma_peak": peak}


def _dissolve(frame_dir: str) -> None:
    """
    Fold the tail back over the head so the clip loops.

    Nothing in the scene shares a period — the structural layer needs 137s for
    one revolution, the light packets 6-11s each, the wobble axes 15-22s — so
    there is no capture length that closes on itself. What is available is a
    cross-dissolve: the first `DISSOLVE_FRAMES` become a mix of themselves and
    the frames that would have followed the clip's end. The result is continuous
    at the loop point and at both ends of the mix; the cost is a fraction of a
    second of ghosting once per loop, which on a slowly rotating cloud of
    additive particles is not something you can see.
    """
    import numpy as np
    from PIL import Image

    for i in range(DISSOLVE_FRAMES):
        head_path = f"{frame_dir}/f{i:05d}.png"
        tail_path = f"{frame_dir}/f{LOOP_FRAMES + i:05d}.png"

        head = np.asarray(Image.open(head_path).convert("RGB"), dtype=np.float32)
        tail = np.asarray(Image.open(tail_path).convert("RGB"), dtype=np.float32)

        # smoothstep, so the mix has zero derivative where it meets untouched
        # footage at both ends and no visible kink appears there.
        x = (i + 0.5) / DISSOLVE_FRAMES
        w = x * x * (3.0 - 2.0 * x)

        blended = head * w + tail * (1.0 - w)
        Image.fromarray(np.clip(blended, 0, 255).astype(np.uint8)).save(head_path)

    print(f"dissolved {DISSOLVE_FRAMES} frames", flush=True)


def _encode_master(frame_dir: str) -> dict:
    """Near-lossless 1080p intermediate, so the delivery encodes can run on CPU."""
    import os
    import subprocess

    scale = f"scale={WIDTH}:{HEIGHT}:flags=lanczos"

    subprocess.run(
        [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-framerate", str(FPS), "-start_number", "0",
            "-i", f"{frame_dir}/f%05d.png",
            "-frames:v", str(LOOP_FRAMES),
            "-vf", scale,
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "12",
            "-pix_fmt", "yuv444p",
            f"{frame_dir}/master.mkv",
        ],
        check=True,
    )

    poster_index = int(LOOP_FRAMES * POSTER_AT)
    subprocess.run(
        [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", f"{frame_dir}/f{poster_index:05d}.png",
            "-vf", scale,
            f"{frame_dir}/poster.png",
        ],
        check=True,
    )

    return {
        "master_bytes": os.path.getsize(f"{frame_dir}/master.mkv"),
        "poster_frame": poster_index,
    }


# ── Encode (no GPU) ───────────────────────────────────────────────────────────


@app.function(image=encode_image, timeout=3600, volumes={"/store": store}, cpu=8.0)
def encode(run_id: str) -> dict:
    """Delivery encodes. Deliberately off the GPU — this is pure CPU work."""
    import os
    import subprocess

    store.reload()
    src = f"/store/{run_id}"
    work = "/tmp/enc"
    os.makedirs(work, exist_ok=True)

    def run(args: list[str]) -> None:
        subprocess.run(
            ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *args], check=True
        )

    master = f"{src}/master.mkv"
    log = f"{work}/pass"

    # Two-pass rather than CRF: the brief is a hard size ceiling, and only a
    # bitrate target actually enforces one.
    common = ["-an", "-r", str(FPS), "-pix_fmt", "yuv420p"]
    run([
        "-i", master, "-c:v", "libx264", "-preset", "slow",
        "-b:v", f"{MP4_KBPS}k", "-pass", "1", "-passlogfile", log,
        *common, "-f", "null", "/dev/null",
    ])
    run([
        "-i", master, "-c:v", "libx264", "-preset", "slow",
        "-b:v", f"{MP4_KBPS}k", "-pass", "2", "-passlogfile", log,
        "-profile:v", "high", "-level", "4.2", "-movflags", "+faststart",
        *common, f"{work}/core-loop.mp4",
    ])

    vlog = f"{work}/vpass"
    run([
        "-i", master, "-c:v", "libvpx-vp9", "-b:v", f"{WEBM_KBPS}k",
        "-pass", "1", "-passlogfile", vlog, "-row-mt", "1", "-cpu-used", "4",
        "-deadline", "good", *common, "-f", "null", "/dev/null",
    ])
    run([
        "-i", master, "-c:v", "libvpx-vp9", "-b:v", f"{WEBM_KBPS}k",
        "-pass", "2", "-passlogfile", vlog, "-row-mt", "1", "-cpu-used", "2",
        "-deadline", "good", *common, f"{work}/core-loop.webm",
    ])

    run(["-i", f"{src}/poster.png", "-q:v", "3", f"{work}/core-poster.jpg"])
    # 1.91:1 is the card aspect every social scraper crops to anyway; doing the
    # crop here means the core stays centred instead of being trimmed blind.
    run([
        "-i", f"{src}/poster.png",
        "-vf", f"crop={WIDTH}:{int(WIDTH / 1.905)},scale=1200:630:flags=lanczos",
        "-q:v", "3", f"{work}/core-og.jpg",
    ])

    files = ["core-loop.mp4", "core-loop.webm", "core-poster.jpg", "core-og.jpg"]
    payload = {name: open(f"{work}/{name}", "rb").read() for name in files}
    sizes = {name: len(blob) for name, blob in payload.items()}
    print(json.dumps(sizes, indent=2), flush=True)
    return {"files": payload, "sizes": sizes}


# ── Entrypoint ────────────────────────────────────────────────────────────────


@app.local_entrypoint()
def main(
    probe_only: bool = False,
    reuse: str = "",
    section_float: float = SECTION_FLOAT,
):
    import time

    if probe_only:
        print(json.dumps(probe.remote(), indent=2)[:6000])
        return

    run_id = reuse or time.strftime("%Y%m%d-%H%M%S")
    meta: dict = {"run_id": run_id}

    if not reuse:
        meta = capture.remote(run_id, section_float)
        print(json.dumps({k: v for k, v in meta.items() if k != "seek"}, indent=2))

    result = encode.remote(run_id)

    out = pathlib.Path("public/hero")
    out.mkdir(parents=True, exist_ok=True)
    for name, blob in result["files"].items():
        (out / name).write_bytes(blob)
        print(f"  {name}  {len(blob) / 1e6:.2f} MB")

    (out / "meta.json").write_text(
        json.dumps(
            {
                "source": "the live site, rendered in headless Chrome on an NVIDIA GPU",
                "renderer": meta.get("renderer"),
                "backend": meta.get("backend"),
                "gpu": RENDER_GPU,
                "resolution": f"{WIDTH}x{HEIGHT}",
                "supersample": SUPERSAMPLE,
                "fps": FPS,
                "frames": LOOP_FRAMES,
                "seconds": LOOP_SECONDS,
                "loop": (
                    f"cross-dissolve, {DISSOLVE_SECONDS}s — nothing in the scene "
                    "shares a period, so the seam is a mix rather than a match"
                ),
                "sectionFloat": section_float,
                "sizes": result["sizes"],
                "run": run_id,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"wrote {out.resolve()}")
