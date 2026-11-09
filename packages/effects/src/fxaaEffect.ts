import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime } from '@flighthq/entity/contract';

import { initializeEffect } from './effect.ts';
import type { FxaaEffect } from './types/FxaaEffect.ts';

export function createFxaaEffect(options: Readonly<Omit<EntityWithoutRuntime<FxaaEffect>, 'kind'>> = {}): FxaaEffect {
  const out = allocateEntity<FxaaEffect>();
  initializeFxaaEffect(out, options);
  return out;
}

export function initializeFxaaEffect(
  out: EntityConstruction<FxaaEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<FxaaEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'FxaaEffect');
  out.edgeThreshold = options.edgeThreshold;
  out.subpixel = options.subpixel;
}
