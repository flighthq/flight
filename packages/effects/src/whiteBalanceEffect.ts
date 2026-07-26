import type { WhiteBalanceEffect } from '@flighthq/types/contract';

export function createWhiteBalanceEffect(options: Readonly<Omit<WhiteBalanceEffect, 'kind'>> = {}): WhiteBalanceEffect {
  return { kind: 'WhiteBalanceEffect', ...options };
}
