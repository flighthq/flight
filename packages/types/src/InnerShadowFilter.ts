import type { BitmapFilter } from './BitmapFilter';

export interface InnerShadowFilter extends BitmapFilter {
  readonly kind: 'InnerShadowFilter';
  readonly alpha?: number;
  readonly angle?: number;
  readonly blurX?: number;
  readonly blurY?: number;
  readonly color?: number;
  readonly distance?: number;
  readonly quality?: number;
  readonly strength?: number;
}
