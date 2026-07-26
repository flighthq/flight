import type { SharpenEffect } from '@flighthq/types/contract';

export function createSharpenEffect(options: Readonly<Omit<SharpenEffect, 'kind'>> = {}): SharpenEffect {
  return { kind: 'SharpenEffect', ...options };
}
