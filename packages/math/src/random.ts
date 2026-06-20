import type { RandomSource } from '@flighthq/types';

export type { RandomSource };

/** Create a fast, deterministic pseudo-random generator seeded by an integer.
 *
 *  Uses the mulberry32 algorithm: a single 32-bit state, good statistical
 *  quality for gameplay/VFX use, and identical output across platforms for a
 *  given seed. Two generators created with the same seed produce the same
 *  sequence, so seeding two consumers identically makes them run in lockstep.
 *
 *  This is the SDK's reusable seeded random — used wherever a render or
 *  simulation must be reproducible (particle emitters, the landing backgrounds,
 *  visual-regression capture) rather than each call site reimplementing it.
 *
 *  ```ts
 *  const random = createRandomSource(0x1234);
 *  const value = random(); // a number in [0, 1)
 *  ```
 */
export function createRandomSource(seed: number): RandomSource {
  // Coerce to a 32-bit unsigned integer; non-finite seeds collapse to 0.
  let a = Number.isFinite(seed) ? seed >>> 0 : 0;
  return function seededRandom(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
