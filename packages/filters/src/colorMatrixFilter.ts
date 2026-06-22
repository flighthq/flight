import type { ColorMatrixFilter } from '@flighthq/types';

export function createColorMatrixFilter(matrix: ReadonlyArray<number>): ColorMatrixFilter {
  return { kind: 'ColorMatrixFilter', matrix };
}
