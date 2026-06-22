import type { HueSaturationEffect } from '@flighthq/types';

export function createHueSaturationEffect(
  options: Readonly<Omit<HueSaturationEffect, 'kind'>> = {},
): HueSaturationEffect {
  return { kind: 'HueSaturationEffect', ...options };
}
