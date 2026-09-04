import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { DitherEffect, EntityConstruction, EntityWithoutRuntime } from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';

export function createDitherEffect(
  options: Readonly<Omit<EntityWithoutRuntime<DitherEffect>, 'kind'>> = {},
): DitherEffect {
  const out = allocateEntity<DitherEffect>();
  initializeDitherEffect(out, options);
  return finishEntity(out);
}

export function initializeDitherEffect(
  out: EntityConstruction<DitherEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<DitherEffect>, 'kind'>>,
): void {
  initializeRenderEffect(out, 'DitherEffect');
  out.levels = options.levels;
}
