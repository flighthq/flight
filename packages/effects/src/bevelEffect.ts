import type { BevelEffect } from '@flighthq/types';

// Bevel composite effect: the directional gradient of the blurred silhouette drives a highlight/shadow edge band, clipped by bevelType and composited over the source.
export function createBevelEffect(options: Readonly<Omit<BevelEffect, 'kind'>> = {}): BevelEffect {
  return { kind: 'BevelEffect', ...options };
}
