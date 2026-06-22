import type { OuterGlowFilter } from '@flighthq/types';

export function createOuterGlowFilter(options?: Omit<OuterGlowFilter, 'kind'>): OuterGlowFilter {
  return { kind: 'OuterGlowFilter', ...options };
}
