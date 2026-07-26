import type { DisplacementEffect } from '@flighthq/types/contract';

export function createDisplacementEffect(options: Readonly<Omit<DisplacementEffect, 'kind'>> = {}): DisplacementEffect {
  return { kind: 'DisplacementEffect', ...options };
}
