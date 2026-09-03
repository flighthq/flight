import { createEntity } from '@flighthq/entity/contract';
import type { PanniniProjectionEffect } from '@flighthq/types/contract';

export function createPanniniProjectionEffect(
  options: Readonly<Omit<PanniniProjectionEffect, 'kind'>> = {},
): PanniniProjectionEffect {
  return createEntity({ kind: 'PanniniProjectionEffect', ...options });
}
