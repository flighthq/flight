import type { DitherEffect } from '@flighthq/types';

export function createDitherEffect(options: Readonly<Omit<DitherEffect, 'kind'>> = {}): DitherEffect {
  return { kind: 'DitherEffect', ...options };
}
