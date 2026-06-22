import type { MedianFilter } from '@flighthq/types';

export function createMedianFilter(options?: Omit<MedianFilter, 'kind'>): MedianFilter {
  return { kind: 'MedianFilter', ...options };
}
