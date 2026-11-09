import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime } from '@flighthq/entity/contract';

import { initializeEffect } from './effect.ts';
import type { LensDirtEffect } from './types/LensDirtEffect.ts';

export function createLensDirtEffect(
  options: Readonly<Omit<EntityWithoutRuntime<LensDirtEffect>, 'kind'>> = {},
): LensDirtEffect {
  const out = allocateEntity<LensDirtEffect>();
  initializeLensDirtEffect(out, options);
  return out;
}

export function initializeLensDirtEffect(
  out: EntityConstruction<LensDirtEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<LensDirtEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'LensDirtEffect');
  out.intensity = options.intensity;
  out.threshold = options.threshold;
  out.seed = options.seed;
}
