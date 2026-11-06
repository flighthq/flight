import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime } from '@flighthq/entity/contract';

import { initializeEffect } from './effect.ts';
import type { TaaEffect } from './types/TaaEffect.ts';

export function createTaaEffect(options: Readonly<Omit<EntityWithoutRuntime<TaaEffect>, 'kind'>> = {}): TaaEffect {
  const out = allocateEntity<TaaEffect>();
  initializeTaaEffect(out, options);
  return finishEntity(out);
}

export function initializeTaaEffect(
  out: EntityConstruction<TaaEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<TaaEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'TaaEffect');
  out.feedback = options.feedback;
}
