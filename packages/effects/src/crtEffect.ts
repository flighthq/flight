import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, CrtEffect } from '@flighthq/types/contract';

export function createCrtEffect(options: Readonly<Omit<EntityWithoutRuntime<CrtEffect>, 'kind'>> = {}): CrtEffect {
  return createEntity({ kind: 'CrtEffect', ...options });
}
