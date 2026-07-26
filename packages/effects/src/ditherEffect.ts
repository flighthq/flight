import type { DitherEffect } from '@flighthq/types/contract';

export function createDitherEffect(options: Readonly<Omit<DitherEffect, 'kind'>> = {}): DitherEffect {
  return { kind: 'DitherEffect', ...options };
}
