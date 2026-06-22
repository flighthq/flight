import type { BevelFilter } from '@flighthq/types';

export function createBevelFilter(options?: Omit<BevelFilter, 'kind'>): BevelFilter {
  return { kind: 'BevelFilter', ...options };
}
