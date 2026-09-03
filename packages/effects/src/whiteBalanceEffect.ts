import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, WhiteBalanceEffect } from '@flighthq/types/contract';

export function createWhiteBalanceEffect(
  options: Readonly<Omit<EntityWithoutRuntime<WhiteBalanceEffect>, 'kind'>> = {},
): WhiteBalanceEffect {
  return createEntity({ kind: 'WhiteBalanceEffect', ...options });
}
