import { createEntity } from '@flighthq/entity/contract';
import type { HalftoneEffect } from '@flighthq/types/contract';

export function createHalftoneEffect(options: Readonly<Omit<HalftoneEffect, 'kind'>> = {}): HalftoneEffect {
  return createEntity({ kind: 'HalftoneEffect', ...options });
}
