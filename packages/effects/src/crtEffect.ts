import type { CrtEffect } from '@flighthq/types';

export function createCrtEffect(options: Readonly<Omit<CrtEffect, 'kind'>> = {}): CrtEffect {
  return { kind: 'CrtEffect', ...options };
}
