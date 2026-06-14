import type { RandomSource } from '@flighthq/types';

export type { RandomSource };

/** Create a fast, deterministic pseudo-random generator seeded by an integer.
 *
 *  Uses the mulberry32 algorithm: a single 32-bit state, good statistical
 *  quality for gameplay/VFX use, and identical output across platforms for a
 *  given seed. Two generators created with the same seed produce the same
 *  sequence, so seeding two emitters identically makes them simulate in lockstep.
 *
 *  ```ts
 *  const state = createParticleEmitterState(createSeededRandomSource(0x1234));
 *  ```
 */
export function createSeededRandomSource(seed: number): RandomSource {
  // Coerce to a 32-bit unsigned integer; non-finite seeds collapse to 0.
  let a = Number.isFinite(seed) ? seed >>> 0 : 0;
  return function seededRandom(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
