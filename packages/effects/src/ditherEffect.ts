import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { DitherEffect, EntityConstruction, EntityWithoutRuntime } from '@flighthq/types/contract';

import { initializeEffect } from './effect';

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
  initializeEffect(out, 'DitherEffect');
  out.levels = options.levels;
}
