import type { InvertEffect } from '@flighthq/types';

export function createInvertEffect(options: Readonly<Omit<InvertEffect, 'kind'>> = {}): InvertEffect {
  return { kind: 'InvertEffect', ...options };
}
