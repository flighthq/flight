import type { HalftoneEffect } from '@flighthq/types';

export function createHalftoneEffect(options: Readonly<Omit<HalftoneEffect, 'kind'>> = {}): HalftoneEffect {
  return { kind: 'HalftoneEffect', ...options };
}
