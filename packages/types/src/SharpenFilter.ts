import type { BitmapFilter } from './BitmapFilter';

export interface SharpenFilter extends BitmapFilter {
  readonly kind: 'SharpenFilter';
  readonly amount?: number;
  readonly blurX?: number;
  readonly blurY?: number;
  readonly quality?: number;
}
