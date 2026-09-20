import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime, KuwaharaEffect } from '@flighthq/types/contract';

import { initializeEffect } from './effect';

export function createKuwaharaEffect(
  options: Readonly<Omit<EntityWithoutRuntime<KuwaharaEffect>, 'kind'>> = {},
): KuwaharaEffect {
  const out = allocateEntity<KuwaharaEffect>();
  initializeKuwaharaEffect(out, options);
  return finishEntity(out);
}

export function initializeKuwaharaEffect(
  out: EntityConstruction<KuwaharaEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<KuwaharaEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'KuwaharaEffect');
  out.radius = options.radius;
}
