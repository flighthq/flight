import type { DropShadowFilter } from '@flighthq/types';

export function createDropShadowFilter(options?: Omit<DropShadowFilter, 'kind'>): DropShadowFilter {
  return { kind: 'DropShadowFilter', ...options };
}
