import type { SsaoEffect } from '@flighthq/types/contract';

export function createSsaoEffect(options: Readonly<Omit<SsaoEffect, 'kind'>> = {}): SsaoEffect {
  return { kind: 'SsaoEffect', ...options };
}
