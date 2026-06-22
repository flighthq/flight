import type { LookupTableGradeEffect } from '@flighthq/types';

export function createLookupTableGradeEffect(
  options: Readonly<Omit<LookupTableGradeEffect, 'kind'>> = {},
): LookupTableGradeEffect {
  return { kind: 'LookupTableGradeEffect', ...options };
}
