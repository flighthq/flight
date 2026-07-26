import type { LensDirtEffect } from '@flighthq/types/contract';

export function createLensDirtEffect(options: Readonly<Omit<LensDirtEffect, 'kind'>> = {}): LensDirtEffect {
  return { kind: 'LensDirtEffect', ...options };
}
