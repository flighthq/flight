import { createEntity } from '@flighthq/entity/contract';
import type { GodRaysEffect } from '@flighthq/types/contract';

export function createGodRaysEffect(options: Readonly<Omit<GodRaysEffect, 'kind'>> = {}): GodRaysEffect {
  return createEntity({ kind: 'GodRaysEffect', ...options });
}
