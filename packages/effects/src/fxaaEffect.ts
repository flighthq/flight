import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime, FxaaEffect } from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';

export function createFxaaEffect(options: Readonly<Omit<EntityWithoutRuntime<FxaaEffect>, 'kind'>> = {}): FxaaEffect {
  const out = allocateEntity<FxaaEffect>();
  initializeFxaaEffect(out, options);
  return finishEntity(out);
}

export function initializeFxaaEffect(
  out: EntityConstruction<FxaaEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<FxaaEffect>, 'kind'>>,
): void {
  initializeRenderEffect(out, 'FxaaEffect');
  out.edgeThreshold = options.edgeThreshold;
  out.subpixel = options.subpixel;
}
