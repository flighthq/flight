import type { HalftoneEffect } from '@flighthq/types/contract';

export function createHalftoneEffect(options: Readonly<Omit<HalftoneEffect, 'kind'>> = {}): HalftoneEffect {
  return { kind: 'HalftoneEffect', ...options };
}
