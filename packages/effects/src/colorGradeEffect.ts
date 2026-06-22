import type { ColorGradeEffect } from '@flighthq/types';

export function createColorGradeEffect(options: Readonly<Omit<ColorGradeEffect, 'kind'>> = {}): ColorGradeEffect {
  return { kind: 'ColorGradeEffect', ...options };
}
