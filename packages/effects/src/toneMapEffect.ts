import { createEntity } from '@flighthq/entity/contract';
import type { ToneMapEffect } from '@flighthq/types/contract';

export function createToneMapEffect(options: Readonly<Omit<ToneMapEffect, 'kind'>> = {}): ToneMapEffect {
  return createEntity({ kind: 'ToneMapEffect', ...options });
}
