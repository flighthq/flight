import { nextPowerOfTwo, previousPowerOfTwo } from './nextPowerOfTwo';

/** Round `n` up to the next power of two.
 *
 *  Alias for `nextPowerOfTwo` — provided for clarity at texture-sizing call
 *  sites where the direction is important.
 */
export function ceilPowerOfTwo(n: number): number {
  return nextPowerOfTwo(n);
}

/** Round `n` down to the previous power of two.
 *
 *  Alias for `previousPowerOfTwo` — provided for clarity at texture-sizing
 *  call sites where the direction is important.
 */
export function floorPowerOfTwo(n: number): number {
  return previousPowerOfTwo(n);
}

/** Quantize `value` into `steps` equal buckets over `[min, max]`.
 *
 *  Returns a value snapped to one of `steps + 1` evenly-spaced values between
 *  `min` and `max`. When `steps <= 0` the result is `min`. When `min === max`
 *  the result is `min`.
 *
 *  ```ts
 *  quantize(0.7, 4, 0, 1) // 0.75  (nearest of 0, 0.25, 0.5, 0.75, 1.0)
 *  ```
 */
export function quantize(value: number, steps: number, min: number, max: number): number {
  if (steps <= 0 || min === max) return min;
  const t = (value - min) / (max - min);
  return min + (Math.round(Math.max(0, Math.min(1, t)) * steps) / steps) * (max - min);
}

/** Zero-aware sign: returns `1` for positive, `-1` for negative, `0` for zero.
 *
 *  Unlike `Math.sign`, this is explicit about the zero-aware contract, and the
 *  name makes intent clear at call sites in animation and physics code.
 */
export function sign(value: number): number {
  return value > 0 ? 1 : value < 0 ? -1 : 0;
}
