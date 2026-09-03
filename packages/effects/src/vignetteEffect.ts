import { createEntity } from '@flighthq/entity/contract';
import type { VignetteEffect } from '@flighthq/types/contract';

export function createVignetteEffect(options: Readonly<Omit<VignetteEffect, 'kind'>> = {}): VignetteEffect {
  return createEntity({ kind: 'VignetteEffect', ...options });
}
