import type { MedianEffect } from '@flighthq/types';

export function createMedianEffect(options: Readonly<Omit<MedianEffect, 'kind'>> = {}): MedianEffect {
  return { kind: 'MedianEffect', ...options };
}
