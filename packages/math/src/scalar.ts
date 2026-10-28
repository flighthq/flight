// Generated from crates/flight-math/src/scalar.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { nextPowerOfTwo, previousPowerOfTwo } from './nextPowerOfTwo.ts';

/**
 * Round `n` up to the next power of two.
 *
 * Alias for `nextPowerOfTwo` — provided for clarity at texture-sizing call
 * sites where the direction is important.
 */
export function ceilPowerOfTwo(n: number): number {
  return nextPowerOfTwo(n) >>> 0;
}

/**
 * Round `n` down to the previous power of two.
 *
 * Alias for `previousPowerOfTwo` — provided for clarity at texture-sizing
 * call sites where the direction is important.
 */
export function floorPowerOfTwo(n: number): number {
  return previousPowerOfTwo(n) >>> 0;
}

/**
 * Quantize `value` into `steps` equal buckets over `[min, max]`.
 *
 * Returns a value snapped to one of `steps + 1` evenly-spaced values between
 * `min` and `max`. When `steps <= 0` the result is `min`. When `min == max`
 * the result is `min`.
 */
export function quantize(value: number, steps: number, min: number, max: number): number {
  if (steps <= 0.0 || min === max) {
    return min;
  }
  const t = (value - min) / (max - min);
  const clamped = t < 0.0 ? 0.0 : t > 1.0 ? 1.0 : t;
  return min + (Math.round(clamped * steps) / steps) * (max - min);
}

/**
 * Zero-aware sign: returns `1` for positive, `-1` for negative, `0` for zero.
 */
export function sign(value: number): number {
  return value > 0.0 ? 1.0 : value < 0.0 ? -1.0 : 0.0;
}
