import { seededRandom } from '@/lib/utils';
import type { ConceptNodeData, CorePointData } from './geometry';

/* ==========================================================================
   SEMANTIC CORE
   --------------------------------------------------------------------------
   Loads the precomputed embedding produced by pipeline/semantic_core.py.

   The shipped positions are a real semantic map: 47,725 substantive Simple
   English Wikipedia articles embedded with BGE, reduced PCA(40) -> UMAP(3),
   and fitted to the core's shell. Neighbouring points are semantically
   related, and each concept node is a k-means centroid labelled with its most
   central article — so the object on screen is the thing the copy describes
   rather than a decorative sphere.

   Everything here is best-effort. If the fetch fails the caller falls back to
   the procedural generator: a network hiccup must never cost you the hero.
   ========================================================================== */

export interface SemanticNode {
  x: number;
  y: number;
  z: number;
  label: string;
  size: number;
}

export interface SemanticData {
  /** Interleaved xyz, already dequantised. */
  positions: Float32Array;
  count: number;
  nodes: SemanticNode[];
}

/** Written by the pipeline into meta.json; kept in sync deliberately. */
const QUANT_SCALE = 16000;

let cached: Promise<SemanticData | null> | null = null;

/**
 * Fetch once per page load and share the promise.
 *
 * Kicked off as early as the module is imported so the 240KB is usually in
 * flight while the preloader is still playing, and the geometry never has to
 * visibly swap after the core has assembled.
 */
export function loadSemanticCore(): Promise<SemanticData | null> {
  if (cached) return cached;

  cached = (async () => {
    try {
      const [ptsRes, nodesRes] = await Promise.all([
        fetch('/core/points.bin'),
        fetch('/core/nodes.json'),
      ]);
      if (!ptsRes.ok || !nodesRes.ok) return null;

      const buf = await ptsRes.arrayBuffer();
      const quantised = new Int16Array(buf);
      const positions = new Float32Array(quantised.length);
      for (let i = 0; i < quantised.length; i++) {
        positions[i] = quantised[i] / QUANT_SCALE;
      }

      const nodes = (await nodesRes.json()) as SemanticNode[];
      if (positions.length < 300 || !Array.isArray(nodes) || nodes.length === 0) {
        return null;
      }

      return { positions, count: positions.length / 3, nodes };
    } catch {
      return null;
    }
  })();

  return cached;
}

// Start the request the moment this module is evaluated. It is only reachable
// from the client-only WebGL entry point, but the guard keeps it honest if that
// ever changes — a relative fetch on the server would throw.
if (typeof window !== 'undefined') void loadSemanticCore();

/**
 * Turn real positions into the attribute set the core shader expects.
 *
 * Subsampling walks a FRACTIONAL stride rather than taking a prefix. The points
 * arrive in corpus order, so a prefix is not a sample of the map — it is the
 * alphabetically-earliest slice of it, and whole regions of the embedding go
 * missing. An integer stride has the same failure whenever the ratio is under
 * 2: floor() collapses to 1 and the walk degenerates into exactly that prefix.
 * Stepping by count/wanted keeps coverage even at every tier.
 */
export function buildCorePointsFromSemantic(
  data: SemanticData,
  wanted: number,
  seed = 1337,
): CorePointData {
  const count = Math.min(wanted, data.count);
  const step = data.count / count;

  const rand = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  const scatter = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const radii = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const src = Math.min(data.count - 1, Math.floor(i * step)) * 3;
    const x = data.positions[src];
    const y = data.positions[src + 1];
    const z = data.positions[src + 2];

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    radii[i] = Math.hypot(x, y, z);

    // Assembly start, identical in spirit to the procedural build.
    const sr = 4.5 + rand() * 7.5;
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    scatter[i * 3] = Math.sin(phi) * Math.cos(theta) * sr;
    scatter[i * 3 + 1] = Math.cos(phi) * sr * 0.7;
    scatter[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * sr;

    seeds[i] = rand();
  }

  return { positions, scatter, seeds, radii, count };
}

/** Concept nodes from the k-means centroids, largest clusters first. */
export function buildConceptNodesFromSemantic(
  data: SemanticData,
  wanted: number,
  seed = 99,
): { data: ConceptNodeData; labels: string[] } {
  const rand = seededRandom(seed);
  // Biggest clusters are the most recognisable topics, so when a tier asks for
  // fewer nodes it should keep those rather than an arbitrary slice.
  const chosen = [...data.nodes]
    .sort((a, b) => b.size - a.size)
    .slice(0, wanted);

  const count = chosen.length;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const labels: string[] = [];

  chosen.forEach((n, i) => {
    positions[i * 3] = n.x;
    positions[i * 3 + 1] = n.y;
    positions[i * 3 + 2] = n.z;
    seeds[i] = rand();
    labels.push(n.label);
  });

  return { data: { positions, seeds, count }, labels };
}
