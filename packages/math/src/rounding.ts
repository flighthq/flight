/** Return `value` ceiled to the nearest multiple of `step`.
 *
 *  `ceilTo(7, 5)` → `10`. When `step <= 0` the result is `value`.
 */
export function ceilTo(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.ceil(value / step) * step;
}

/** True non-negative modulo: `euclideanMod(value, divisor)`.
 *
 *  Unlike JavaScript's `%` operator, the result is always in `[0, divisor)`
 *  regardless of the sign of `value`. Throws when `divisor === 0` (programmer
 *  error: a zero divisor is always a bug at the call site).
 *
 *  ```ts
 *  euclideanMod(-1, 4) // 3  (JS: -1)
 *  euclideanMod(7, 4)  // 3
 *  ```
 */
export function euclideanMod(value: number, divisor: number): number {
  if (divisor === 0) throw new RangeError('euclideanMod: divisor must not be 0');
  return ((value % divisor) + divisor) % divisor;
}

/** Return `value` floored to the nearest multiple of `step`.
 *
 *  `floorTo(7, 5)` → `5`. When `step <= 0` the result is `value`.
 */
export function floorTo(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.floor(value / step) * step;
}

/** Return the fractional part of `value` — the part after the decimal point.
 *
 *  Always returns a value in `[0, 1)` for positive inputs. For negative inputs
 *  the sign is preserved (e.g. `fract(-1.3)` → `-0.3`), mirroring GLSL `fract`.
 */
export function fract(value: number): number {
  return value - Math.trunc(value);
}

/** Round `value` to the nearest multiple of `step`.
 *
 *  `roundTo(7, 5)` → `5`; `roundTo(8, 5)` → `10`. When `step <= 0` the
 *  result is `value`. Also useful as a snap / quantize primitive.
 */
export function roundTo(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}
