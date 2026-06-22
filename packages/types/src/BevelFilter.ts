import type { BitmapFilter } from './BitmapFilter';

export interface BevelFilter extends BitmapFilter {
  readonly kind: 'BevelFilter';
  readonly angle?: number;
  readonly bevelType?: 'full' | 'inner' | 'outer';
  readonly blurX?: number;
  readonly blurY?: number;
  readonly distance?: number;
  readonly highlightAlpha?: number;
  readonly highlightColor?: number;
  readonly knockout?: boolean;
  readonly quality?: number;
  readonly shadowAlpha?: number;
  readonly shadowColor?: number;
  readonly strength?: number;
}
