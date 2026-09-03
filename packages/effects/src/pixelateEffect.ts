import { createEntity } from '@flighthq/entity/contract';
import type { PixelateEffect } from '@flighthq/types/contract';

export function createPixelateEffect(options: Readonly<Omit<PixelateEffect, 'kind'>> = {}): PixelateEffect {
  return createEntity({ kind: 'PixelateEffect', ...options });
}
