import { createEntity } from '@flighthq/entity/contract';
import type { SharpenEffect } from '@flighthq/types/contract';

export function createSharpenEffect(options: Readonly<Omit<SharpenEffect, 'kind'>> = {}): SharpenEffect {
  return createEntity({ kind: 'SharpenEffect', ...options });
}
