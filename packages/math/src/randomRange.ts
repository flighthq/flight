import type { RandomSource } from '@flighthq/types';

/** Return a random boolean with the given `probability` of being `true`.
 *
 *  `probability` is clamped to `[0, 1]`; `0.5` is a fair coin flip.
 */
export function randomBool(random: RandomSource, probability: number = 0.5): boolean {
  return random() < probability;
}

/** Return a random integer in the inclusive range `[min, max]`.
 *
 *  Both bounds must be integers; the function passes them through `Math.floor`
 *  so non-integer bounds are truncated toward zero rather than throwing. Throws
 *  if `min > max`.
 */
export function randomInt(random: RandomSource, min: number, max: number): number {
  const lo = Math.floor(min);
  const hi = Math.floor(max);
  if (lo > hi) throw new RangeError('randomInt: min must be <= max');
  return lo + Math.floor(random() * (hi - lo + 1));
}

/** Return a random float in the half-open range `[min, max)`. */
export function randomRange(random: RandomSource, min: number, max: number): number {
  return min + random() * (max - min);
}

/** Return a random sign: either `1` or `-1` with equal probability. */
export function randomSign(random: RandomSource): number {
  return random() < 0.5 ? -1 : 1;
}
