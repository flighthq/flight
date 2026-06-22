import type { SharpenFilter } from '@flighthq/types';

export function createSharpenFilter(options?: Omit<SharpenFilter, 'kind'>): SharpenFilter {
  return { kind: 'SharpenFilter', ...options };
}
