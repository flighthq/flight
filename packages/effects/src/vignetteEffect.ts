import type { VignetteEffect } from '@flighthq/types';

export function createVignetteEffect(options: Readonly<Omit<VignetteEffect, 'kind'>> = {}): VignetteEffect {
  return { kind: 'VignetteEffect', ...options };
}
