import type { PixelateEffect } from '@flighthq/types/contract';

export function createPixelateEffect(options: Readonly<Omit<PixelateEffect, 'kind'>> = {}): PixelateEffect {
  return { kind: 'PixelateEffect', ...options };
}
