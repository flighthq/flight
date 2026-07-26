import type { RadialBlurEffect } from '@flighthq/types/contract';

export function createRadialBlurEffect(options: Readonly<Omit<RadialBlurEffect, 'kind'>> = {}): RadialBlurEffect {
  return { kind: 'RadialBlurEffect', ...options };
}
