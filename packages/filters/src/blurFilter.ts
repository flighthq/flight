import type { BlurFilter } from '@flighthq/types';

export function createBlurFilter(options?: Omit<BlurFilter, 'kind'>): BlurFilter {
  return { kind: 'BlurFilter', ...options };
}
