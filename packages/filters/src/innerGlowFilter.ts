import type { InnerGlowFilter } from '@flighthq/types';

export function createInnerGlowFilter(options?: Omit<InnerGlowFilter, 'kind'>): InnerGlowFilter {
  return { kind: 'InnerGlowFilter', ...options };
}
