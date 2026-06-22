import type { ScanlinesEffect } from '@flighthq/types';

export function createScanlinesEffect(options: Readonly<Omit<ScanlinesEffect, 'kind'>> = {}): ScanlinesEffect {
  return { kind: 'ScanlinesEffect', ...options };
}
