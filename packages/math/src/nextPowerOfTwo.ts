// Generated from crates/flight-math/src/next_power_of_two.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

/**
 * Return `true` if `n` is an integer power of two (i.e. 1, 2, 4, 8, ...).
 *
 * Returns `false` for `n <= 0`.
 */
export function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

/**
 * Round `value` up to the nearest multiple of `multiple`.
 *
 * `nextMultipleOf(7.0, 4.0)` -> `8.0`. When `multiple <= 0` the result is `value`.
 */
export function nextMultipleOf(value: number, multiple: number): number {
  if (multiple <= 0.0) {
    return value;
  }
  const remainder = value % multiple;
  return remainder === 0.0 ? value : value + multiple - remainder;
}

/**
 * Round `n` up to the next power of two.
 *
 * Uses integer bit-twiddling for stability on large values. Returns `1` for
 * `n <= 1`.
 */
export function nextPowerOfTwo(n: number): number {
  if (n <= 1) {
    return 1;
  }
  let v = (n - 1) >>> 0;
  v |= v >>> 1;
  v |= v >>> 2;
  v |= v >>> 4;
  v |= v >>> 8;
  v |= v >>> 16;
  return (v + 1) >>> 0;
}

/**
 * Round `n` down to the largest power of two that is `<= n`.
 *
 * `previousPowerOfTwo(6)` -> `4`. Returns `1` for `n <= 1`.
 */
export function previousPowerOfTwo(n: number): number {
  if (n <= 1) {
    return 1;
  }
  let v = n;
  v |= v >> 1;
  v |= v >> 2;
  v |= v >> 4;
  v |= v >> 8;
  v |= v >> 16;
  return (((v >>> 0) + 1) >>> 0) >>> 1;
}
