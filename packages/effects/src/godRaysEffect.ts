import type { GodRaysEffect } from '@flighthq/types';

export function createGodRaysEffect(options: Readonly<Omit<GodRaysEffect, 'kind'>> = {}): GodRaysEffect {
  return { kind: 'GodRaysEffect', ...options };
}
