import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, FxaaEffect } from '@flighthq/types/contract';

export function createFxaaEffect(options: Readonly<Omit<EntityWithoutRuntime<FxaaEffect>, 'kind'>> = {}): FxaaEffect {
  return createEntity({ kind: 'FxaaEffect', ...options });
}
