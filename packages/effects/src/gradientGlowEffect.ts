import type { GradientGlowEffect } from '@flighthq/types';

// Gradient-glow composite effect: an outer glow whose color is looked up from a colors/alphas/ratios gradient ramp indexed by the blurred silhouette alpha, then sourceMode decides source compositing.
export function createGradientGlowEffect(options: Readonly<Omit<GradientGlowEffect, 'kind'>>): GradientGlowEffect {
  return { kind: 'GradientGlowEffect', ...options };
}
