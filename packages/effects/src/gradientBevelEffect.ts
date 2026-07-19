import type { GradientBevelEffect } from '@flighthq/types';

// Gradient-bevel composite effect: a bevel whose highlight→shadow band color is looked up from a colors/alphas/ratios gradient ramp indexed by the encoded bevel depth, then sourceMode decides source compositing.
export function createGradientBevelEffect(options: Readonly<Omit<GradientBevelEffect, 'kind'>>): GradientBevelEffect {
  return { kind: 'GradientBevelEffect', ...options };
}
