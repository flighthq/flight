// Generated from crates/flight-math/src/rounding.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

/**
 * Return `value` ceiled to the nearest multiple of `step`.
 *
 * `ceilTo(7.0, 5.0)` -> `10.0`. When `step <= 0` the result is `value`.
 */
export function ceilTo(value: number, step: number): number {
  if (step <= 0.0) {
    return value;
  }
  return Math.ceil(value / step) * step;
}

/**
 * True non-negative modulo: `euclideanMod(value, divisor)`.
 *
 * Unlike the remainder operator, the result is always in `[0, divisor)`
 * regardless of the sign of `value`. Throws when `divisor == 0`.
 */
export function euclideanMod(value: number, divisor: number): number {
  if (divisor === 0.0) {
    throw new RangeError('euclideanMod: divisor must not be 0');
  }
  return ((value % divisor) + divisor) % divisor;
}

/**
 * Return `value` floored to the nearest multiple of `step`.
 *
 * `floorTo(7.0, 5.0)` -> `5.0`. When `step <= 0` the result is `value`.
 */
export function floorTo(value: number, step: number): number {
  if (step <= 0.0) {
    return value;
  }
  return Math.floor(value / step) * step;
}

/**
 * Return the fractional part of `value` — the part after the decimal point.
 *
 * Always returns a value in `[0, 1)` for positive inputs. For negative inputs
 * the sign is preserved (e.g. `fract(-1.3)` -> `-0.3`), mirroring GLSL `fract`.
 */
export function fract(value: number): number {
  return value - Math.trunc(value);
}

/**
 * Round `value` to the nearest multiple of `step`, with halfway ties away from zero.
 *
 * `roundTo(7.0, 5.0)` -> `5.0`; `roundTo(8.0, 5.0)` -> `10.0`. When `step <= 0`
 * the result is `value`.
 */
export function roundTo(value: number, step: number): number {
  if (step <= 0.0) {
    return value;
  }
  const magnitude = Math.round(Math.abs(value) / step) * step;
  if (magnitude === 0.0) {
    return 0.0;
  }
  return value < 0.0 ? -magnitude : magnitude;
}
