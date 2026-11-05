// Generated from crates/flight-math/src/comparison.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { EPSILON } from './constants.ts';

/**
 * Return `true` if `|a - b| <= epsilon`.
 *
 * Uses an absolute epsilon, appropriate for values near zero. For magnitudes
 * much larger than 1, use `approxEqualRelative`.
 */
export function approxEqual(a: number, b: number, epsilon?: number): boolean {
  epsilon = epsilon ?? EPSILON;
  return Math.abs(a - b) <= epsilon;
}

/**
 * Return `true` if `a` and `b` agree to within a relative tolerance.
 *
 * Uses `|a - b| <= relativeEpsilon * max(|a|, |b|)`, which scales with
 * magnitude and is appropriate for large numbers where absolute epsilon
 * comparisons fail. For values near zero, falls back to `EPSILON`
 * (absolute).
 */
export function approxEqualRelative(a: number, b: number, relativeEpsilon?: number): boolean {
  relativeEpsilon = relativeEpsilon ?? EPSILON;
  const diff = Math.abs(a - b);
  const largest = Math.abs(a) > Math.abs(b) ? Math.abs(a) : Math.abs(b);
  let threshold = relativeEpsilon * largest;
  threshold = threshold > EPSILON ? threshold : EPSILON;
  return diff <= threshold;
}

/**
 * Return `true` if `|value| <= epsilon`.
 */
export function approxZero(value: number, epsilon?: number): boolean {
  epsilon = epsilon ?? EPSILON;
  return Math.abs(value) <= epsilon;
}
