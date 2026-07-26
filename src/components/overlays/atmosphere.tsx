/**
 * The permanent background treatment.
 *
 * Deliberately split across two fixed layers rather than one. The drifting
 * blobs and the survey grid sit at z-0, *behind* the WebGL canvas (z-1), so the
 * Knowledge Core reads as embedded in the fog. The grain and the vignettes sit
 * at z-2, in *front* of the canvas but behind page content (z-10) — so the 3D
 * layer and the DOM share one film stock and one set of edges instead of
 * looking like two images pasted together.
 *
 * The blobs are gradients, not blurred solids. A `blur()` filter on a 78vmax
 * element forces a full-viewport offscreen pass on every frame of a 26s
 * animation; a radial-gradient with soft stops is indistinguishable at this
 * scale and costs nothing.
 */
export function Atmosphere() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        <div
          className="animate-drift absolute -top-[26vmax] -left-[20vmax] h-[78vmax] w-[78vmax] opacity-55 motion-reduce:opacity-20"
          style={{
            background:
              'radial-gradient(closest-side, color-mix(in oklab, var(--color-blue) 34%, transparent), color-mix(in oklab, var(--color-blue) 11%, transparent) 46%, transparent 76%)',
          }}
        />

        <div
          className="animate-drift absolute -right-[24vmax] -bottom-[30vmax] h-[86vmax] w-[86vmax] opacity-45 [animation-delay:-13s] [animation-duration:41s] motion-reduce:opacity-15"
          style={{
            background:
              'radial-gradient(closest-side, color-mix(in oklab, var(--color-violet) 30%, transparent), color-mix(in oklab, var(--color-violet) 9%, transparent) 44%, transparent 74%)',
          }}
        />

        <div className="grid-lines mask-fade-y absolute inset-0 opacity-70" />
      </div>

      <div aria-hidden className="pointer-events-none fixed inset-0 z-[2]">
        <div className="grain absolute inset-0 opacity-[0.035] mix-blend-overlay" />

        <div className="absolute inset-x-0 top-0 h-[16vh] bg-gradient-to-b from-void/85 via-void/35 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-[26vh] bg-gradient-to-t from-void/90 via-void/45 to-transparent" />
      </div>
    </>
  );
}
