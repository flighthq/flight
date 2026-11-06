import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime } from '@flighthq/entity/contract';

import { initializeEffect } from './effect.ts';
import type { KuwaharaEffect } from './types/KuwaharaEffect.ts';

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
