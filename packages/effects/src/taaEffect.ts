import { createEntity } from '@flighthq/entity/contract';
import type { TaaEffect } from '@flighthq/types/contract';

export function createTaaEffect(options: Readonly<Omit<TaaEffect, 'kind'>> = {}): TaaEffect {
  return createEntity({ kind: 'TaaEffect', ...options });
}
