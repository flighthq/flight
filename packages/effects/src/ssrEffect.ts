import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, SsrEffect } from '@flighthq/types/contract';

export function createSsrEffect(options: Readonly<Omit<EntityWithoutRuntime<SsrEffect>, 'kind'>> = {}): SsrEffect {
  return createEntity({ kind: 'SsrEffect', ...options });
}
