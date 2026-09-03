import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, LensDistortionEffect } from '@flighthq/types/contract';

export function createLensDistortionEffect(
  options: Readonly<Omit<EntityWithoutRuntime<LensDistortionEffect>, 'kind'>> = {},
): LensDistortionEffect {
  return createEntity({ kind: 'LensDistortionEffect', ...options });
}
