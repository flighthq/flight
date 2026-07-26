import type { LensDistortionEffect } from '@flighthq/types/contract';

export function createLensDistortionEffect(
  options: Readonly<Omit<LensDistortionEffect, 'kind'>> = {},
): LensDistortionEffect {
  return { kind: 'LensDistortionEffect', ...options };
}
