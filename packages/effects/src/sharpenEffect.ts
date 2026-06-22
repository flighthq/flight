import type { SharpenEffect } from '@flighthq/types';

export function createSharpenEffect(options: Readonly<Omit<SharpenEffect, 'kind'>> = {}): SharpenEffect {
  return { kind: 'SharpenEffect', ...options };
}
