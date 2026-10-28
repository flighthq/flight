// Generated from crates/flight-math/src/random_range.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { RandomSource } from './random.ts';

/**
 * Return a random boolean with the given `probability` of being `true`.
 *
 * Values outside `[0, 1]` behave like the nearest endpoint; `0.5` is a fair coin flip.
 */
export function randomBool(random: RandomSource, probability?: number): boolean {
  probability = probability ?? 0.5;
  return random() < probability;
}

/**
 * Return a random integer in the inclusive range `[min, max]`.
 *
 * Throws if `min` is greater than `max`.
 */
export function randomInt(random: RandomSource, min: number, max: number): number {
  if (min > max) {
    throw new RangeError('randomInt: min must be <= max');
  }
  return (min + Math.floor(random() * (max - min + 1))) | 0;
}

/**
 * Return a random float in the half-open range `[min, max)`.
 */
export function randomRange(random: RandomSource, min: number, max: number): number {
  return min + random() * (max - min);
}

/**
 * Return a random sign: either `1` or `-1` with equal probability.
 */
export function randomSign(random: RandomSource): number {
  return random() < 0.5 ? -1.0 : 1.0;
}
