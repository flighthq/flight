import type { TaaEffect } from '@flighthq/types/contract';

export function createTaaEffect(options: Readonly<Omit<TaaEffect, 'kind'>> = {}): TaaEffect {
  return { kind: 'TaaEffect', ...options };
}
