import type { GradientBevelFilter } from '@flighthq/types';

export function createGradientBevelFilter(options: Omit<GradientBevelFilter, 'kind'>): GradientBevelFilter {
  return { kind: 'GradientBevelFilter', ...options };
}
