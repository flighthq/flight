import type { LensDirtEffect } from '@flighthq/types';

export function createLensDirtEffect(options: Readonly<Omit<LensDirtEffect, 'kind'>> = {}): LensDirtEffect {
  return { kind: 'LensDirtEffect', ...options };
}
