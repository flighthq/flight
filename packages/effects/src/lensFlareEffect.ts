import type { LensFlareEffect } from '@flighthq/types/contract';

export function createLensFlareEffect(options: Readonly<Omit<LensFlareEffect, 'kind'>> = {}): LensFlareEffect {
  return { kind: 'LensFlareEffect', ...options };
}
