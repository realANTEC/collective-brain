import * as THREE from 'three';
import { seededRandom } from '@/lib/utils';

/* ══════════════════════════════════════════════════════════════════════════
   GEOMETRY GENERATION
   ──────────────────────────────────────────────────────────────────────────
   Everything here is deterministic (seeded PRNG) so the scene is identical on
   every load and across SSR/CSR — a randomly-different core on each refresh
   would make the product feel unreliable rather than alive.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Fibonacci sphere — the only distribution that spaces N points on a sphere
 * evenly without clumping at the poles the way naive lat/long sampling does.
 */
export function fibonacciSphere(count: number, radius = 1): Float32Array {
  const out = new Float32Array(count * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < count; i++) {
    const y = 1 - (i / Math.max(1, count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    out[i * 3] = Math.cos(theta) * r * radius;
    out[i * 3 + 1] = y * radius;
    out[i * 3 + 2] = Math.sin(theta) * r * radius;
  }
  return out;
}

export interface CorePointData {
  positions: Float32Array;
  /** Where each point starts before the assembly animation. */
  scatter: Float32Array;
  /** Per-point random in [0,1) — drives phase, delay, colour mix, visibility. */
  seeds: Float32Array;
  /** Distance from origin, precomputed so the pulse shader skips a sqrt. */
  radii: Float32Array;
  count: number;
}

/**
 * The dense shell that reads as "millions of nodes".
 *
 * Points are pushed onto a spherical shell but with a noise-modulated radius,
 * so the surface has visible density strata rather than looking like a perfect
 * mathematical sphere. A fraction are pulled inward to fill the volume —
 * without them the core reads as hollow when the camera flies inside it.
 */
export function buildCorePoints(count: number, seed = 1337): CorePointData {
  const rand = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  const scatter = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const radii = new Float32Array(count);

  const golden = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const ringRadius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;

    // Jitter the lattice slightly — a perfect Fibonacci grid produces moiré
    // spirals at certain camera distances that read as a rendering artefact.
    const jitter = 0.035;
    let nx = Math.cos(theta) * ringRadius + (rand() - 0.5) * jitter;
    let ny = y + (rand() - 0.5) * jitter;
    let nz = Math.sin(theta) * ringRadius + (rand() - 0.5) * jitter;

    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;

    // 78% form the luminous shell, 22% fill the interior volume.
    const isShell = rand() > 0.22;
    const strata = 0.06 * Math.sin(ny * 9.0 + theta * 0.6);
    const r = isShell
      ? 1.0 + strata + rand() * 0.13
      : 0.24 + Math.pow(rand(), 0.55) * 0.74;

    positions[i * 3] = nx * r;
    positions[i * 3 + 1] = ny * r;
    positions[i * 3 + 2] = nz * r;
    radii[i] = r;

    // Assembly start: a wide, sparse cloud the core condenses out of.
    const sr = 4.5 + rand() * 7.5;
    const sTheta = rand() * Math.PI * 2;
    const sPhi = Math.acos(2 * rand() - 1);
    scatter[i * 3] = Math.sin(sPhi) * Math.cos(sTheta) * sr;
    scatter[i * 3 + 1] = Math.cos(sPhi) * sr * 0.7;
    scatter[i * 3 + 2] = Math.sin(sPhi) * Math.sin(sTheta) * sr;

    seeds[i] = rand();
  }

  return { positions, scatter, seeds, radii, count };
}

export interface ConceptNodeData {
  positions: Float32Array;
  seeds: Float32Array;
  count: number;
}

/** The larger, hoverable nodes — the "concepts" the dense cloud supports. */
// Radius sits just outside the dense shell (which tops out around 1.13). Push
// it much further and the nodes stop reading as the graph's landmarks and start
// looking like a separate ring of orbiting objects.
export function buildConceptNodes(count: number, radius = 1.2, seed = 99): ConceptNodeData {
  const rand = seededRandom(seed);
  const base = fibonacciSphere(count, radius);
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    // Nudge each node off the perfect lattice so connections look organic.
    const wobble = 0.11;
    positions[i * 3] = base[i * 3] * (1 + (rand() - 0.5) * wobble);
    positions[i * 3 + 1] = base[i * 3 + 1] * (1 + (rand() - 0.5) * wobble);
    positions[i * 3 + 2] = base[i * 3 + 2] * (1 + (rand() - 0.5) * wobble);
    seeds[i] = rand();
  }

  return { positions, seeds, count };
}

export interface ConnectionData {
  positions: Float32Array;
  /** 0→1 position along the owning arc, per vertex. Drives the travelling pulse. */
  progress: Float32Array;
  /** Per-arc random, constant across the arc's vertices. Desynchronises pulses. */
  seeds: Float32Array;
  /** Normalised arc length — long arcs get dimmer so the core doesn't smear. */
  weights: Float32Array;
  vertexCount: number;
  arcCount: number;
}

/**
 * Build great-circle arcs between nearby concept nodes.
 *
 * Straight chords between points on a sphere cut *through* the core and read
 * as a wireframe cage. Slerping along the surface and bulging slightly outward
 * makes the connections wrap the body — which is what makes it look like a
 * network rather than a polyhedron.
 *
 * The whole set is emitted as one interleaved LineSegments buffer: a single
 * draw call for ~200 animated connections.
 */
export function buildConnections(
  nodes: ConceptNodeData,
  {
    neighbours = 3,
    maxArcs = 220,
    segments = 22,
    bulge = 0.16,
    seed = 4242,
  }: {
    neighbours?: number;
    maxArcs?: number;
    segments?: number;
    bulge?: number;
    seed?: number;
  } = {},
): ConnectionData {
  const rand = seededRandom(seed);
  const { positions: np, count } = nodes;

  // Collect candidate pairs: each node links to its k nearest neighbours.
  const pairs: Array<[number, number, number]> = [];
  const seen = new Set<number>();

  for (let i = 0; i < count; i++) {
    const ax = np[i * 3];
    const ay = np[i * 3 + 1];
    const az = np[i * 3 + 2];

    const dists: Array<{ j: number; d: number }> = [];
    for (let j = 0; j < count; j++) {
      if (i === j) continue;
      const dx = np[j * 3] - ax;
      const dy = np[j * 3 + 1] - ay;
      const dz = np[j * 3 + 2] - az;
      dists.push({ j, d: dx * dx + dy * dy + dz * dz });
    }
    dists.sort((a, b) => a.d - b.d);

    for (let k = 0; k < Math.min(neighbours, dists.length); k++) {
      const j = dists[k].j;
      const key = i < j ? i * count + j : j * count + i;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push([i, j, Math.sqrt(dists[k].d)]);
    }
  }

  // A few long-range "insight" links — the visual claim that distant fields
  // turn out to be connected. Deliberately rare.
  for (let n = 0; n < 14; n++) {
    const i = Math.floor(rand() * count);
    const j = Math.floor(rand() * count);
    if (i === j) continue;
    const key = i < j ? i * count + j : j * count + i;
    if (seen.has(key)) continue;
    seen.add(key);
    const dx = np[j * 3] - np[i * 3];
    const dy = np[j * 3 + 1] - np[i * 3 + 1];
    const dz = np[j * 3 + 2] - np[i * 3 + 2];
    pairs.push([i, j, Math.hypot(dx, dy, dz)]);
  }

  const arcs = pairs.slice(0, maxArcs);
  const arcCount = arcs.length;
  const segsPerArc = segments;
  const vertsPerArc = segsPerArc * 2; // LineSegments: one pair per segment
  const vertexCount = arcCount * vertsPerArc;

  const outPos = new Float32Array(vertexCount * 3);
  const outProg = new Float32Array(vertexCount);
  const outSeed = new Float32Array(vertexCount);
  const outWeight = new Float32Array(vertexCount);

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();

  let maxLen = 0;
  for (const [, , d] of arcs) maxLen = Math.max(maxLen, d);

  let v = 0;
  for (let arc = 0; arc < arcCount; arc++) {
    const [i, j, dist] = arcs[arc];
    a.set(np[i * 3], np[i * 3 + 1], np[i * 3 + 2]);
    b.set(np[j * 3], np[j * 3 + 1], np[j * 3 + 2]);

    const arcSeed = rand();
    const weight = 1 - Math.min(1, dist / (maxLen || 1)) * 0.7;

    const radiusA = a.length();
    const radiusB = b.length();

    for (let s = 0; s < segsPerArc; s++) {
      const t0 = s / segsPerArc;
      const t1 = (s + 1) / segsPerArc;

      slerpOnSphere(p, a, b, t0, radiusA, radiusB, bulge);
      slerpOnSphere(q, a, b, t1, radiusA, radiusB, bulge);

      outPos[v * 3] = p.x;
      outPos[v * 3 + 1] = p.y;
      outPos[v * 3 + 2] = p.z;
      outProg[v] = t0;
      outSeed[v] = arcSeed;
      outWeight[v] = weight;
      v++;

      outPos[v * 3] = q.x;
      outPos[v * 3 + 1] = q.y;
      outPos[v * 3 + 2] = q.z;
      outProg[v] = t1;
      outSeed[v] = arcSeed;
      outWeight[v] = weight;
      v++;
    }
  }

  return {
    positions: outPos,
    progress: outProg,
    seeds: outSeed,
    weights: outWeight,
    vertexCount,
    arcCount,
  };
}

/** Spherical interpolation with an outward bulge peaking at the arc midpoint. */
function slerpOnSphere(
  out: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  t: number,
  radiusA: number,
  radiusB: number,
  bulge: number,
) {
  // Normalised slerp keeps the path on the sphere surface.
  const dot = Math.min(1, Math.max(-1, (a.x * b.x + a.y * b.y + a.z * b.z) / (radiusA * radiusB)));
  const omega = Math.acos(dot);
  const sinOmega = Math.sin(omega);

  if (sinOmega < 1e-5) {
    out.lerpVectors(a, b, t);
    return;
  }

  const wa = Math.sin((1 - t) * omega) / sinOmega;
  const wb = Math.sin(t * omega) / sinOmega;

  out.set(a.x * wa + b.x * wb, a.y * wa + b.y * wb, a.z * wa + b.z * wb);

  // Lift the middle of the arc off the surface so overlapping connections
  // separate in depth instead of z-fighting into a single flat mesh.
  const lift = 1 + Math.sin(t * Math.PI) * bulge;
  out.multiplyScalar(lift);
}

/**
 * Sparse volumetric dust filling the space *around* the core. Parallaxes
 * against the core on pointer move, which is what sells the depth.
 */
export function buildDust(count: number, seed = 7): { positions: Float32Array; seeds: Float32Array } {
  const rand = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    // Shell-biased so dust doesn't pile up inside the core where it would
    // wash out the nucleus.
    const r = 3.2 + Math.pow(rand(), 0.6) * 13;
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    positions[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
    positions[i * 3 + 1] = Math.cos(phi) * r * 0.85;
    positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
    seeds[i] = rand();
  }

  return { positions, seeds };
}
