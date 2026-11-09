import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime } from '@flighthq/entity/contract';

import { initializeEffect } from './effect.ts';
import type { SharpenEffect } from './types/SharpenEffect.ts';

export function createSharpenEffect(
  options: Readonly<Omit<EntityWithoutRuntime<SharpenEffect>, 'kind'>> = {},
): SharpenEffect {
  const out = allocateEntity<SharpenEffect>();
  initializeSharpenEffect(out, options);
  return out;
}

export function initializeSharpenEffect(
  out: EntityConstruction<SharpenEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<SharpenEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'SharpenEffect');
  out.amount = options.amount;
}
