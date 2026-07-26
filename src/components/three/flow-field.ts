import * as THREE from 'three';

/* ==========================================================================
   FLOW FIELD
   --------------------------------------------------------------------------
   Loads the baked curl-noise volume produced by pipeline/flow_field.py and
   hands it to the core-points material as an ordinary 2D texture.

   The asset is a 64³ divergence-free vector field — the curl of a
   three-octave value-noise potential, so it has no sources or sinks anywhere
   in the volume — flattened into a tiled ATLAS:

       512 × 512 RGB, 64 z-slices laid out in an 8 × 8 grid.
       Slice k occupies tile (col = k % 8, row = k / 8).
       Within a tile, image column = x and image row = y.
       RGB is xyz remapped from [-1, 1] to [0, 1].

   An atlas rather than a WebGL2 sampler3D: a plain texture keeps the loader,
   the type, and above all the fallback trivial. The shader pays two fetches
   and a mix for the z blend; bilinear in xy comes free from the sampler.

   Everything here is best-effort, exactly like semantic-core.ts. If the fetch
   fails, the decode fails, or the atlas is the wrong shape, the caller gets
   null, `uFlowAmt` never leaves 0, and the shell keeps the sin() wobble it has
   always had. A missing texture must cost you nothing.
   ========================================================================== */

/** Voxels per axis of the baked volume. Mirrors RES in the pipeline. */
export const FLOW_SIZE = 64;
/** Slices per atlas row and column. Mirrors TILES; FLOW_TILES² === FLOW_SIZE. */
export const FLOW_TILES = 8;

const ATLAS_EDGE = FLOW_SIZE * FLOW_TILES;

let neutral: THREE.DataTexture | null = null;

/**
 * A 1×1 stand-in bound before (and instead of) the real atlas.
 *
 * Sampling an unbound sampler2D is legal but noisy — three warns, and some
 * drivers are less relaxed about it than the spec is. 128 decodes to exactly
 * zero through the shader's `(rgb - 0.5) * 2` remap, so even if the guard were
 * ever bypassed the field would read as perfectly still rather than as garbage.
 */
export function neutralFlowTexture(): THREE.DataTexture {
  if (!neutral) {
    neutral = new THREE.DataTexture(
      new Uint8Array([128, 128, 128, 255]),
      1,
      1,
      THREE.RGBAFormat,
    );
    neutral.needsUpdate = true;
  }
  return neutral;
}

function configure(tex: THREE.Texture): THREE.Texture {
  // Vectors, not colour. An sRGB transfer applied to a direction field would
  // bend every component toward zero and skew the whole flow inward.
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  // The shader does its own tiling arithmetic and clamps inside each tile, so
  // wrapping here would only ever paper over an addressing bug.
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  // Row 0 of the PNG must land at v = 0 for the atlas maths to hold; three
  // flips on upload by default.
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

let cached: Promise<THREE.Texture | null> | null = null;

/** Fetch once per page load and share the promise. */
export function loadFlowField(): Promise<THREE.Texture | null> {
  if (cached) return cached;

  cached = new Promise<THREE.Texture | null>((resolve) => {
    try {
      new THREE.TextureLoader().load(
        '/core/flow.png',
        (tex) => {
          const img = tex.image as { width?: number; height?: number } | null;
          if (img?.width !== ATLAS_EDGE || img?.height !== ATLAS_EDGE) {
            // A differently sized atlas would sample as a smooth field of
            // plausible-looking garbage rather than failing loudly, so treat
            // the dimensions as part of the contract.
            tex.dispose();
            resolve(null);
            return;
          }
          resolve(configure(tex));
        },
        undefined,
        () => resolve(null),
      );
    } catch {
      resolve(null);
    }
  });

  return cached;
}

// Start the request as the module is evaluated, so the 450KB is normally in
// flight while the preloader is still playing and the motion never visibly
// changes character after the core has settled. Only reachable from the
// client-only WebGL entry point; the guard keeps it honest if that changes.
if (typeof window !== 'undefined') void loadFlowField();
