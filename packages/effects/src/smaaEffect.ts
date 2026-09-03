import { createEntity } from '@flighthq/entity/contract';
import type { SmaaEffect } from '@flighthq/types/contract';

export function createSmaaEffect(options: Readonly<Omit<SmaaEffect, 'kind'>> = {}): SmaaEffect {
  return createEntity({ kind: 'SmaaEffect', ...options });
}
