import type { SmaaEffect } from '@flighthq/types/contract';

export function createSmaaEffect(options: Readonly<Omit<SmaaEffect, 'kind'>> = {}): SmaaEffect {
  return { kind: 'SmaaEffect', ...options };
}
