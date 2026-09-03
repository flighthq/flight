import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, GodRaysEffect } from '@flighthq/types/contract';

export function createGodRaysEffect(
  options: Readonly<Omit<EntityWithoutRuntime<GodRaysEffect>, 'kind'>> = {},
): GodRaysEffect {
  return createEntity({ kind: 'GodRaysEffect', ...options });
}
