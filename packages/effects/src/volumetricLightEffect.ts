import type { VolumetricLightEffect } from '@flighthq/types/contract';

export function createVolumetricLightEffect(
  options: Readonly<Omit<VolumetricLightEffect, 'kind'>> = {},
): VolumetricLightEffect {
  return { kind: 'VolumetricLightEffect', ...options };
}
