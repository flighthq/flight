import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime, WhiteBalanceEffect } from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';

export function createWhiteBalanceEffect(
  options: Readonly<Omit<EntityWithoutRuntime<WhiteBalanceEffect>, 'kind'>> = {},
): WhiteBalanceEffect {
  const out = allocateEntity<WhiteBalanceEffect>();
  initializeWhiteBalanceEffect(out, options);
  return finishEntity(out);
}

export function initializeWhiteBalanceEffect(
  out: EntityConstruction<WhiteBalanceEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<WhiteBalanceEffect>, 'kind'>>,
): void {
  initializeRenderEffect(out, 'WhiteBalanceEffect');
  out.temperature = options.temperature;
  out.tint = options.tint;
}
