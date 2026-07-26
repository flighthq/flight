import type { FxaaEffect } from '@flighthq/types/contract';

export function createFxaaEffect(options: Readonly<Omit<FxaaEffect, 'kind'>> = {}): FxaaEffect {
  return { kind: 'FxaaEffect', ...options };
}
