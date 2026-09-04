import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime, SmaaEffect } from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';

export function createSmaaEffect(options: Readonly<Omit<EntityWithoutRuntime<SmaaEffect>, 'kind'>> = {}): SmaaEffect {
  const out = allocateEntity<SmaaEffect>();
  initializeSmaaEffect(out, options);
  return finishEntity(out);
}

export function initializeSmaaEffect(
  out: EntityConstruction<SmaaEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<SmaaEffect>, 'kind'>>,
): void {
  initializeRenderEffect(out, 'SmaaEffect');
  out.threshold = options.threshold;
}
