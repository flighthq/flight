import type { EasingFunction } from '@flighthq/types';

// Samples `ease` at `count` uniformly-spaced values of t in [0,1] and writes
// the results into `out`. When `out` is omitted, a new Float32Array of length
// `count` is allocated. Returns the output array (always the same object as
// `out` when one is supplied).
//
// The first sample is always ease(0) and the last is always ease(1) when
// count ≥ 2. For count=1, the single sample is ease(0.5) — the midpoint.
//
// Use this to bake a curve to a lookup table for cheap evaluation in tight
// loops or GPU uploads where calling the full easing function per-frame is
// undesirable. For conformance comparison, the output is deterministic for the
// same `count` across environments.
//
// Programmer errors (count < 1, non-finite count) throw.
export function createEasingSamples(ease: EasingFunction, count: number, out?: Float32Array): Float32Array {
  if (!Number.isFinite(count) || count < 1) {
    throw new Error('createEasingSamples: count must be a finite integer >= 1');
  }
  const n = Math.floor(count);
  const result = out ?? new Float32Array(n);
  if (n === 1) {
    result[0] = ease(0.5);
    return result;
  }
  const step = 1 / (n - 1);
  for (let i = 0; i < n; i++) {
    // Read t into a local before writing to result, preserving alias safety.
    const t = i * step;
    result[i] = ease(t < 0 ? 0 : t > 1 ? 1 : t);
  }
  // Clamp the endpoints exactly to avoid floating-point drift.
  result[0] = ease(0);
  result[n - 1] = ease(1);
  return result;
}
