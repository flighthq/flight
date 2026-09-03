import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, VignetteEffect } from '@flighthq/types/contract';

export function createVignetteEffect(
  options: Readonly<Omit<EntityWithoutRuntime<VignetteEffect>, 'kind'>> = {},
): VignetteEffect {
  return createEntity({ kind: 'VignetteEffect', ...options });
}
