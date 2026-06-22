import type { DisplacementMapFilter } from '@flighthq/types';

export function createDisplacementMapFilter(options?: Omit<DisplacementMapFilter, 'kind'>): DisplacementMapFilter {
  return { kind: 'DisplacementMapFilter', ...options };
}
