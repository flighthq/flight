import type { PanniniProjectionEffect } from '@flighthq/types';

export function createPanniniProjectionEffect(
  options: Readonly<Omit<PanniniProjectionEffect, 'kind'>> = {},
): PanniniProjectionEffect {
  return { kind: 'PanniniProjectionEffect', ...options };
}
