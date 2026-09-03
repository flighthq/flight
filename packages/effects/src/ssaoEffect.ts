import { createEntity } from '@flighthq/entity/contract';
import type { SsaoEffect } from '@flighthq/types/contract';

export function createSsaoEffect(options: Readonly<Omit<SsaoEffect, 'kind'>> = {}): SsaoEffect {
  return createEntity({ kind: 'SsaoEffect', ...options });
}
