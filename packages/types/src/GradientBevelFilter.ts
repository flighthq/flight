import type { BitmapFilter } from './BitmapFilter';

export interface GradientBevelFilter extends BitmapFilter {
  readonly kind: 'GradientBevelFilter';
  readonly alphas: ReadonlyArray<number>;
  readonly angle?: number;
  readonly bevelType?: 'full' | 'inner' | 'outer';
  readonly blurX?: number;
  readonly blurY?: number;
  readonly colors: ReadonlyArray<number>;
  readonly distance?: number;
  readonly quality?: number;
  readonly ratios: ReadonlyArray<number>;
  readonly strength?: number;
}
