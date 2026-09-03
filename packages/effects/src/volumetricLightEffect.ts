import { createEntity } from '@flighthq/entity/contract';
import type { VolumetricLightEffect } from '@flighthq/types/contract';

export function createVolumetricLightEffect(
  options: Readonly<Omit<VolumetricLightEffect, 'kind'>> = {},
): VolumetricLightEffect {
  return createEntity({ kind: 'VolumetricLightEffect', ...options });
}
