import type { BitmapFilter } from './BitmapFilter';

export interface BlurFilter extends BitmapFilter {
  readonly kind: 'BlurFilter';
  readonly blurX?: number;
  readonly blurY?: number;
}
