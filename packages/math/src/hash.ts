import type { RandomSource } from '@flighthq/types';

import { createRandomSource } from './random';

/** Create a `RandomSource` seeded from a deterministic hash of `x` and `y`.
 *
 *  Connects the stateless hash layer to the seeded-PRNG layer — each grid
 *  cell gets an independent reproducible random stream.
 *
 *  ```ts
 *  const rng = createRandomSourceFromHash(tileX, tileY);
 *  const treasure = rng() < 0.05; // 5% chance, reproducible per tile
 *  ```
 */
export function createRandomSourceFromHash(x: number, y: number): RandomSource {
  return createRandomSource(hash2D(x, y));
}

/** Stateless position-seeded hash over a 2D integer grid.
 *
 *  Returns a deterministic `number` in `[0, 2³²)`. Suitable for procedural
 *  tile/cell content and gradient noise seed generation.
 */
export function hash2D(x: number, y: number): number {
  return hashCombine(hashUint32(x | 0), y | 0);
}

/** Stateless position-seeded hash over a 3D integer grid. */
export function hash3D(x: number, y: number, z: number): number {
  return hashCombine(hash2D(x, y), z | 0);
}

/** Combine a running hash `seed` with a new `value` using a Murmur3-inspired mix.
 *
 *  Used to build multi-dimensional hashes from `hashUint32`:
 *  ```ts
 *  const h = hashCombine(hashUint32(x), y);
 *  ```
 */
export function hashCombine(seed: number, value: number): number {
  return hashUint32(seed ^ (value + 0x9e3779b9 + (seed << 6) + (seed >> 2)));
}

/** Finalise an arbitrary 32-bit integer through the fmix32 finalizer (Murmur3).
 *
 *  Produces a deterministic, well-distributed 32-bit unsigned integer from any
 *  input. Useful as a stateless hash function for individual values.
 */
export function hashUint32(value: number): number {
  let h = value | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) | 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) | 0;
  h ^= h >>> 16;
  return h >>> 0;
}
