import type { SepiaEffect } from '@flighthq/types';

export function createSepiaEffect(options: Readonly<Omit<SepiaEffect, 'kind'>> = {}): SepiaEffect {
  return { kind: 'SepiaEffect', ...options };
}
