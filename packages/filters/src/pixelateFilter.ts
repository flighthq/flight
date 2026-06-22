import type { PixelateFilter } from '@flighthq/types';

export function createPixelateFilter(options?: Omit<PixelateFilter, 'kind'>): PixelateFilter {
  return { kind: 'PixelateFilter', ...options };
}
