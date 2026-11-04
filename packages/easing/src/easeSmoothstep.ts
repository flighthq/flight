// Generated from crates/flight-easing/src/ease_smoothstep.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { ScalarRemap } from './easingTypes.ts';

/**
 * Perlin's smootherstep: a higher-order variant with zero first- and
 * second-derivatives at both endpoints.
 */
export function easeSmootherstep(t: number): number {
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

/**
 * Hermite smoothstep: a sigmoid-like ease with zero first-derivative at both endpoints.
 */
export function easeSmoothstep(t: number): number {
  return t * t * (3.0 - 2.0 * t);
}

/**
 * Returns a smoothstep remap over an arbitrary domain [edge0, edge1].
 * The returned function clamps its input to [edge0, edge1], maps to [0, 1],
 * and applies the Hermite smoothstep.
 */
export function easeSmoothstepRange(edge0: number, edge1: number): ScalarRemap {
  return (x: number): number => {
    const raw = (x - edge0) / (edge1 - edge0);
    const t = raw < 0.0 ? 0.0 : raw > 1.0 ? 1.0 : raw;
    return t * t * (3.0 - 2.0 * t);
  };
}
