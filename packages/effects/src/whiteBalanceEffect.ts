import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime } from '@flighthq/entity/contract';

import { initializeEffect } from './effect.ts';
import type { WhiteBalanceEffect } from './types/WhiteBalanceEffect.ts';

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
  initializeEffect(out, 'WhiteBalanceEffect');
  out.temperature = options.temperature;
  out.tint = options.tint;
}
