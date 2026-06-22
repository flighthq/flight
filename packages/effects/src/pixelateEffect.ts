import type { PixelateEffect } from '@flighthq/types';

export function createPixelateEffect(options: Readonly<Omit<PixelateEffect, 'kind'>> = {}): PixelateEffect {
  return { kind: 'PixelateEffect', ...options };
}
