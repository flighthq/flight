import type { InnerShadowFilter } from '@flighthq/types';

export function createInnerShadowFilter(options?: Omit<InnerShadowFilter, 'kind'>): InnerShadowFilter {
  return { kind: 'InnerShadowFilter', ...options };
}
