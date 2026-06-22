import type { BitmapFilter } from './BitmapFilter';

export interface MedianFilter extends BitmapFilter {
  readonly kind: 'MedianFilter';
  readonly radius?: number;
}
