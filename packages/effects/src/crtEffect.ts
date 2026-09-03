import { createEntity } from '@flighthq/entity/contract';
import type { CrtEffect } from '@flighthq/types/contract';

export function createCrtEffect(options: Readonly<Omit<CrtEffect, 'kind'>> = {}): CrtEffect {
  return createEntity({ kind: 'CrtEffect', ...options });
}
