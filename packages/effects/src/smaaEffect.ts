import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, SmaaEffect } from '@flighthq/types/contract';

export function createSmaaEffect(options: Readonly<Omit<EntityWithoutRuntime<SmaaEffect>, 'kind'>> = {}): SmaaEffect {
  return createEntity({ kind: 'SmaaEffect', ...options });
}
