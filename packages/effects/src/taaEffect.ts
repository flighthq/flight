import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, TaaEffect } from '@flighthq/types/contract';

export function createTaaEffect(options: Readonly<Omit<EntityWithoutRuntime<TaaEffect>, 'kind'>> = {}): TaaEffect {
  return createEntity({ kind: 'TaaEffect', ...options });
}
