import { createEntity } from '@flighthq/entity/contract';
import type { WhiteBalanceEffect } from '@flighthq/types/contract';

export function createWhiteBalanceEffect(options: Readonly<Omit<WhiteBalanceEffect, 'kind'>> = {}): WhiteBalanceEffect {
  return createEntity({ kind: 'WhiteBalanceEffect', ...options });
}
