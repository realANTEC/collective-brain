import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind class strings so later utilities win over earlier ones. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ── Math ─────────────────────────────────────────────────────────────────── */

export const clamp = (v: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, v));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Frame-rate-independent exponential smoothing.
 *
 * A naive `lerp(current, target, 0.1)` inside useFrame moves faster on a 144Hz
 * display than on a 60Hz one. Converting the factor through the frame delta
 * makes the *perceived* smoothing identical on every refresh rate — this is
 * what makes the scene feel the same on every machine.
 */
export const damp = (current: number, target: number, lambda: number, dt: number) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

/** Remap a value from one range to another, clamped to the output range. */
export const mapRange = (
  v: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
) => {
  if (inMax - inMin === 0) return outMin;
  const t = clamp((v - inMin) / (inMax - inMin));
  return outMin + t * (outMax - outMin);
};

/** Smoothstep — an S-curve with zero first derivative at both ends. */
export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/** Deterministic pseudo-random from an integer seed (mulberry32). */
export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── Formatting ───────────────────────────────────────────────────────────── */

const COMPACT = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export const formatCompact = (n: number) => COMPACT.format(n);

export const formatFull = (n: number) => n.toLocaleString('en-US');

/** "2.4s ago" style relative labels for the simulated live activity feed. */
export function formatAgo(seconds: number) {
  if (seconds < 60) return `${Math.max(1, Math.floor(seconds))}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/* ── Misc ─────────────────────────────────────────────────────────────────── */

export const isBrowser = typeof window !== 'undefined';

/** Split a string into characters while keeping whole words groupable. */
export function splitWords(text: string) {
  return text.split(' ').map((word, i) => ({ word, index: i }));
}
