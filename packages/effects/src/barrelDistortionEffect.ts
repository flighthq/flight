import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, BarrelDistortionEffect } from '@flighthq/types/contract';

export function createBarrelDistortionEffect(
  options: Readonly<Omit<EntityWithoutRuntime<BarrelDistortionEffect>, 'kind'>> = {},
): BarrelDistortionEffect {
  return createEntity({ kind: 'BarrelDistortionEffect', ...options });
}
