import type { ToneMapEffect } from '@flighthq/types';

export function createToneMapEffect(options: Readonly<Omit<ToneMapEffect, 'kind'>> = {}): ToneMapEffect {
  return { kind: 'ToneMapEffect', ...options };
}
