import { createEntity } from '@flighthq/entity/contract';
import type { FxaaEffect } from '@flighthq/types/contract';

export function createFxaaEffect(options: Readonly<Omit<FxaaEffect, 'kind'>> = {}): FxaaEffect {
  return createEntity({ kind: 'FxaaEffect', ...options });
}
