import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime, ScanlinesEffect } from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';

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
  initializeRenderEffect(out, 'ScanlinesEffect');
  out.count = options.count;
  out.intensity = options.intensity;
}
