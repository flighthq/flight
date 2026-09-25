import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime, ToneMapEffect } from '@flighthq/types/contract';

import { initializeEffect } from './effect.ts';

export function createToneMapEffect(
  options: Readonly<Omit<EntityWithoutRuntime<ToneMapEffect>, 'kind'>> = {},
): ToneMapEffect {
  const out = allocateEntity<ToneMapEffect>();
  initializeToneMapEffect(out, options);
  return finishEntity(out);
}

export function initializeToneMapEffect(
  out: EntityConstruction<ToneMapEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<ToneMapEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'ToneMapEffect');
  out.operator = options.operator;
  out.exposure = options.exposure;
  out.white = options.white;
}
