'use client';

import dynamic from 'next/dynamic';

/**
 * The WebGL layer is loaded client-side only and outside the critical path.
 *
 * three + R3F + postprocessing is ~450kB of JavaScript. Deferring it means the
 * hero's typography, the search field and the whole first screen are
 * interactive before a single byte of it arrives — which is the difference
 * between a fast site with heavy visuals and a heavy site.
 */
export const KnowledgeCoreScene = dynamic(() => import('./SceneCanvas'), {
  ssr: false,
  loading: () => null,
});

/**
 * Nothing else may be re-exported from './SceneCanvas' here.
 *
 * A static `export { X } from './SceneCanvas'` puts three.js back into the
 * initial module graph of every page that touches this barrel, and the
 * `dynamic()` above silently stops meaning anything — the chunk gets preloaded
 * from the server HTML like any other dependency. Consumers that need
 * `CoreDragSurface` must import it through their own `dynamic()` boundary.
 *
 * The two modules below are safe: neither imports three.
 */
export { SECTION_COUNT } from './choreography';
export { orbit, resetOrbit } from './interaction';
