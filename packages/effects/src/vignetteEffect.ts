import type { VignetteEffect } from '@flighthq/types/contract';

export function createVignetteEffect(options: Readonly<Omit<VignetteEffect, 'kind'>> = {}): VignetteEffect {
  return { kind: 'VignetteEffect', ...options };
}
