import type { CrtEffect } from '@flighthq/types/contract';

export function createCrtEffect(options: Readonly<Omit<CrtEffect, 'kind'>> = {}): CrtEffect {
  return { kind: 'CrtEffect', ...options };
}
