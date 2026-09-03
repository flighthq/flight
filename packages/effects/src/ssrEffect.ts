import { createEntity } from '@flighthq/entity/contract';
import type { SsrEffect } from '@flighthq/types/contract';

export function createSsrEffect(options: Readonly<Omit<SsrEffect, 'kind'>> = {}): SsrEffect {
  return createEntity({ kind: 'SsrEffect', ...options });
}
