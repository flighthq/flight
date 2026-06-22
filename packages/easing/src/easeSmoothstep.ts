import type { EasingFunction } from '@flighthq/types';

// Perlin's smootherstep: a higher-order variant with zero first- and
// second-derivatives at both endpoints, for a gentler approach to 0 and 1.
// Like the other families here, input is assumed pre-clamped to [0,1].
export const easeSmootherstep: EasingFunction = (t) => t * t * t * (t * (t * 6 - 15) + 10);

// Hermite smoothstep: a sigmoid-like ease with zero first-derivative at both endpoints.
export const easeSmoothstep: EasingFunction = (t) => t * t * (3 - 2 * t);
