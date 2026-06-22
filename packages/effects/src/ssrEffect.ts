import type { SsrEffect } from '@flighthq/types';

export function createSsrEffect(options: Readonly<Omit<SsrEffect, 'kind'>> = {}): SsrEffect {
  return { kind: 'SsrEffect', ...options };
}
