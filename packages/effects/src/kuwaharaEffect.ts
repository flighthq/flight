import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, KuwaharaEffect } from '@flighthq/types/contract';

export function createKuwaharaEffect(
  options: Readonly<Omit<EntityWithoutRuntime<KuwaharaEffect>, 'kind'>> = {},
): KuwaharaEffect {
  return createEntity({ kind: 'KuwaharaEffect', ...options });
}
