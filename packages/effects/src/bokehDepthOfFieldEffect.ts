import type { BokehDepthOfFieldEffect } from '@flighthq/types';

export function createBokehDepthOfFieldEffect(
  options: Readonly<Omit<BokehDepthOfFieldEffect, 'kind'>> = {},
): BokehDepthOfFieldEffect {
  return { kind: 'BokehDepthOfFieldEffect', ...options };
}
