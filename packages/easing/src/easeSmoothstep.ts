import type { EasingFunction, ScalarRemap } from '@flighthq/types';

// Perlin's smootherstep: a higher-order variant with zero first- and
// second-derivatives at both endpoints, for a gentler approach to 0 and 1.
// Like the other families here, input is assumed pre-clamped to [0,1].
export const easeSmootherstep: EasingFunction = (t) => t * t * t * (t * (t * 6 - 15) + 10);

// Hermite smoothstep: a sigmoid-like ease with zero first-derivative at both endpoints.
export const easeSmoothstep: EasingFunction = (t) => t * t * (3 - 2 * t);

// Returns a smoothstep remap over an arbitrary domain [edge0, edge1].
// The returned function clamps its input to [edge0, edge1], maps to [0, 1],
// and applies the Hermite smoothstep. Unlike EasingFunction (domain [0,1]),
// the result is a ScalarRemap whose domain is [edge0, edge1].
export function easeSmoothstepRange(edge0: number, edge1: number): ScalarRemap {
  return (x) => {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  };
}
