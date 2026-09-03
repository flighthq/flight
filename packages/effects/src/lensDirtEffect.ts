import { createEntity } from '@flighthq/entity/contract';
import type { LensDirtEffect } from '@flighthq/types/contract';

export function createLensDirtEffect(options: Readonly<Omit<LensDirtEffect, 'kind'>> = {}): LensDirtEffect {
  return createEntity({ kind: 'LensDirtEffect', ...options });
}
