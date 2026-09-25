import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime, ScanlinesEffect } from '@flighthq/types/contract';

import { initializeEffect } from './effect.ts';

export function createScanlinesEffect(
  options: Readonly<Omit<EntityWithoutRuntime<ScanlinesEffect>, 'kind'>> = {},
): ScanlinesEffect {
  const out = allocateEntity<ScanlinesEffect>();
  initializeScanlinesEffect(out, options);
  return finishEntity(out);
}

export function initializeScanlinesEffect(
  out: EntityConstruction<ScanlinesEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<ScanlinesEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'ScanlinesEffect');
  out.count = options.count;
  out.intensity = options.intensity;
}
