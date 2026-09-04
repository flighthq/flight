import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime, LensDirtEffect } from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';

export function createLensDirtEffect(
  options: Readonly<Omit<EntityWithoutRuntime<LensDirtEffect>, 'kind'>> = {},
): LensDirtEffect {
  const out = allocateEntity<LensDirtEffect>();
  initializeLensDirtEffect(out, options);
  return finishEntity(out);
}

export function initializeLensDirtEffect(
  out: EntityConstruction<LensDirtEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<LensDirtEffect>, 'kind'>>,
): void {
  initializeRenderEffect(out, 'LensDirtEffect');
  out.intensity = options.intensity;
  out.threshold = options.threshold;
  out.seed = options.seed;
}
