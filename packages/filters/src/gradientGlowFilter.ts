import type { GradientGlowFilter } from '@flighthq/types';

export function createGradientGlowFilter(options: Omit<GradientGlowFilter, 'kind'>): GradientGlowFilter {
  return { kind: 'GradientGlowFilter', ...options };
}
