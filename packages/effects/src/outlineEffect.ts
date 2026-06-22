import type { OutlineEffect } from '@flighthq/types';

export function createOutlineEffect(options: Readonly<Omit<OutlineEffect, 'kind'>> = {}): OutlineEffect {
  return { kind: 'OutlineEffect', ...options };
}
