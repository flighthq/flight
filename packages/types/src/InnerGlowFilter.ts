import type { BitmapFilter } from './BitmapFilter';

export interface InnerGlowFilter extends BitmapFilter {
  readonly kind: 'InnerGlowFilter';
  readonly alpha?: number;
  readonly blurX?: number;
  readonly blurY?: number;
  readonly color?: number;
  readonly quality?: number;
  readonly strength?: number;
}
