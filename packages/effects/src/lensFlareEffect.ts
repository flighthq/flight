import { createEntity } from '@flighthq/entity/contract';
import type { LensFlareEffect } from '@flighthq/types/contract';

export function createLensFlareEffect(options: Readonly<Omit<LensFlareEffect, 'kind'>> = {}): LensFlareEffect {
  return createEntity({ kind: 'LensFlareEffect', ...options });
}
