import type { SsrEffect } from '@flighthq/types/contract';

export function createSsrEffect(options: Readonly<Omit<SsrEffect, 'kind'>> = {}): SsrEffect {
  return { kind: 'SsrEffect', ...options };
}
