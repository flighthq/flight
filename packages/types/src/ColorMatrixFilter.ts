import type { BitmapFilter } from './BitmapFilter';

export interface ColorMatrixFilter extends BitmapFilter {
  readonly kind: 'ColorMatrixFilter';
  readonly matrix: ReadonlyArray<number>;
}
