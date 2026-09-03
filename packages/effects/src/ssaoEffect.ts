import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, SsaoEffect } from '@flighthq/types/contract';

export function createSsaoEffect(options: Readonly<Omit<EntityWithoutRuntime<SsaoEffect>, 'kind'>> = {}): SsaoEffect {
  return createEntity({ kind: 'SsaoEffect', ...options });
}
