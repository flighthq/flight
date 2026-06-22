import type { RadialBlurEffect } from '@flighthq/types';

export function createRadialBlurEffect(options: Readonly<Omit<RadialBlurEffect, 'kind'>> = {}): RadialBlurEffect {
  return { kind: 'RadialBlurEffect', ...options };
}
