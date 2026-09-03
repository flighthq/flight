import { createEntity } from '@flighthq/entity/contract';
import type { LensDistortionEffect } from '@flighthq/types/contract';

export function createLensDistortionEffect(
  options: Readonly<Omit<LensDistortionEffect, 'kind'>> = {},
): LensDistortionEffect {
  return createEntity({ kind: 'LensDistortionEffect', ...options });
}
