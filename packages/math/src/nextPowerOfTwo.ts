/** Return `true` if `n` is an integer power of two (i.e. 1, 2, 4, 8, …).
 *
 *  Returns `false` for `n <= 0`.
 */
export function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

/** Round `value` up to the nearest multiple of `multiple`.
 *
 *  `nextMultipleOf(7, 4)` → `8`. When `multiple <= 0` the result is `value`.
 */
export function nextMultipleOf(value: number, multiple: number): number {
  if (multiple <= 0) return value;
  const remainder = value % multiple;
  return remainder === 0 ? value : value + multiple - remainder;
}

/** Round `n` up to the next power of two.
 *
 *  Uses integer bit-twiddling for stability on large values. Returns `1` for
 *  `n <= 1`.
 */
export function nextPowerOfTwo(n: number): number {
  if (n <= 1) return 1;
  // Decrement so exact powers of two are unchanged, then propagate the
  // highest set bit downward and add 1 to get the next power.
  n = (n - 1) | 0;
  n |= n >> 1;
  n |= n >> 2;
  n |= n >> 4;
  n |= n >> 8;
  n |= n >> 16;
  return (n + 1) >>> 0;
}

/** Round `n` down to the largest power of two that is `<= n`.
 *
 *  `previousPowerOfTwo(6)` → `4`. Returns `1` for `n <= 1`.
 */
export function previousPowerOfTwo(n: number): number {
  if (n <= 1) return 1;
  // Fill all bits below the highest set bit, then shift right by 1.
  n = n | 0;
  n |= n >> 1;
  n |= n >> 2;
  n |= n >> 4;
  n |= n >> 8;
  n |= n >> 16;
  return (n + 1) >> 1;
}
