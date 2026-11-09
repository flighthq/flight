import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime } from '@flighthq/entity/contract';

import { initializeEffect } from './effect.ts';
import type { DitherEffect } from './types/DitherEffect.ts';

export function createDitherEffect(
  options: Readonly<Omit<EntityWithoutRuntime<DitherEffect>, 'kind'>> = {},
): DitherEffect {
  const out = allocateEntity<DitherEffect>();
  initializeDitherEffect(out, options);
  return out;
}

export function initializeDitherEffect(
  out: EntityConstruction<DitherEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<DitherEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'DitherEffect');
  out.levels = options.levels;
}
