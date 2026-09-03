import { createEntity } from '@flighthq/entity/contract';
import type { ScanlinesEffect } from '@flighthq/types/contract';

export function createScanlinesEffect(options: Readonly<Omit<ScanlinesEffect, 'kind'>> = {}): ScanlinesEffect {
  return createEntity({ kind: 'ScanlinesEffect', ...options });
}
