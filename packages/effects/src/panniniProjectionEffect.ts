import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, PanniniProjectionEffect } from '@flighthq/types/contract';

export function createPanniniProjectionEffect(
  options: Readonly<Omit<EntityWithoutRuntime<PanniniProjectionEffect>, 'kind'>> = {},
): PanniniProjectionEffect {
  return createEntity({ kind: 'PanniniProjectionEffect', ...options });
}
