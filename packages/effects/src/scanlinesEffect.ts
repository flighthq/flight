import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, ScanlinesEffect } from '@flighthq/types/contract';

export function createScanlinesEffect(
  options: Readonly<Omit<EntityWithoutRuntime<ScanlinesEffect>, 'kind'>> = {},
): ScanlinesEffect {
  return createEntity({ kind: 'ScanlinesEffect', ...options });
}
