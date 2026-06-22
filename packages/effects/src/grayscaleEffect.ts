import type { GrayscaleEffect } from '@flighthq/types';

export function createGrayscaleEffect(options: Readonly<Omit<GrayscaleEffect, 'kind'>> = {}): GrayscaleEffect {
  return { kind: 'GrayscaleEffect', ...options };
}
