import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime, SharpenEffect } from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';

export function createSharpenEffect(
  options: Readonly<Omit<EntityWithoutRuntime<SharpenEffect>, 'kind'>> = {},
): SharpenEffect {
  const out = allocateEntity<SharpenEffect>();
  initializeSharpenEffect(out, options);
  return finishEntity(out);
}

export function initializeSharpenEffect(
  out: EntityConstruction<SharpenEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<SharpenEffect>, 'kind'>>,
): void {
  initializeRenderEffect(out, 'SharpenEffect');
  out.amount = options.amount;
}
