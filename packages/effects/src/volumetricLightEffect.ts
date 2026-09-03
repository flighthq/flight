import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, VolumetricLightEffect } from '@flighthq/types/contract';

export function createVolumetricLightEffect(
  options: Readonly<Omit<EntityWithoutRuntime<VolumetricLightEffect>, 'kind'>> = {},
): VolumetricLightEffect {
  return createEntity({ kind: 'VolumetricLightEffect', ...options });
}
