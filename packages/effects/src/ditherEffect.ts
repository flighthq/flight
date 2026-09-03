import { createEntity } from '@flighthq/entity/contract';
import type { DitherEffect } from '@flighthq/types/contract';

export function createDitherEffect(options: Readonly<Omit<DitherEffect, 'kind'>> = {}): DitherEffect {
  return createEntity({ kind: 'DitherEffect', ...options });
}
