// Generated from crates/flight-math/src/hash.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { RandomSource } from './random.ts';
import { createRandomSource } from './random.ts';

/**
 * Create a `RandomSource` seeded from a deterministic hash of `x` and `y`.
 *
 * Connects the stateless hash layer to the seeded-PRNG layer — each grid
 * cell gets an independent reproducible random stream.
 */
export function createRandomSourceFromHash(x: number, y: number): RandomSource {
  return createRandomSource(hash2D(x, y));
}

/**
 * Stateless position-seeded hash over a 2D integer grid.
 *
 * Returns a deterministic value in `[0, 2^32)`. Suitable for procedural
 * tile/cell content and gradient noise seed generation.
 */
export function hash2D(x: number, y: number): number {
  return hashCombine(hashUint32(x >>> 0), y >>> 0) >>> 0;
}

/**
 * Stateless position-seeded hash over a 3D integer grid.
 */
export function hash3D(x: number, y: number, z: number): number {
  return hashCombine(hash2D(x, y), z >>> 0) >>> 0;
}

/**
 * Combine a running hash `seed` with a new `value` using a Murmur3-inspired mix.
 *
 * Used to build multi-dimensional hashes from `hashUint32`.
 */
export function hashCombine(seed: number, value: number): number {
  const seedI = seed | 0;
  const inner = (((((((value + 0x9e3779b9) >>> 0) + (seedI << 6)) >>> 0) >>> 0) + (seedI >> 2)) >>> 0) >>> 0;
  return hashUint32((seed ^ inner) >>> 0) >>> 0;
}

/**
 * Finalise an arbitrary 32-bit integer through the fmix32 finalizer (Murmur3).
 *
 * Produces a deterministic, well-distributed 32-bit unsigned integer from any
 * input. Useful as a stateless hash function for individual values.
 */
export function hashUint32(value: number): number {
  let h = value;
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h >>> 0;
}
