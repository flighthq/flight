// Generated from crates/flight-math/src/random.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

/**
 * A callable random source. Cloning it shares the stream, as a TS function reference does.
 */
export type RandomSource = () => number;

/**
 * Create a fast, deterministic pseudo-random generator seeded by an integer.
 *
 * Uses the mulberry32 algorithm: a single 32-bit state, good statistical
 * quality for gameplay/VFX use, and identical output across platforms for a
 * given seed.
 */
export function createRandomSource(seed: number): RandomSource {
  const state = { value: seed >>> 0 };
  return () => {
    const a = (state.value = (state.value + 1831565813) >>> 0);
    let t = Math.imul((a ^ (a >>> 15)) >>> 0, 1 | a) >>> 0;
    t = ((((t + Math.imul((t ^ (t >>> 7)) >>> 0, 61 | t)) >>> 0) >>> 0) ^ t) >>> 0;
    const sample = ((t ^ (t >>> 14)) >>> 0) / 4294967296.0;
    return Math.min(sample, 1.0 - Math.pow(2, -23) / 2.0);
  };
}
