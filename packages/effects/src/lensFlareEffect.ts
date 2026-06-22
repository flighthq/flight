import type { LensFlareEffect } from '@flighthq/types';

export function createLensFlareEffect(options: Readonly<Omit<LensFlareEffect, 'kind'>> = {}): LensFlareEffect {
  return { kind: 'LensFlareEffect', ...options };
}
