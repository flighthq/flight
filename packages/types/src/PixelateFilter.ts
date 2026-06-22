import type { BitmapFilter } from './BitmapFilter';

export interface PixelateFilter extends BitmapFilter {
  readonly kind: 'PixelateFilter';
  readonly blockSize?: number;
}
