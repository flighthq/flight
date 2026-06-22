import type { BitmapFilter } from './BitmapFilter';

export interface GradientGlowFilter extends BitmapFilter {
  readonly kind: 'GradientGlowFilter';
  readonly alphas: ReadonlyArray<number>;
  readonly blurX?: number;
  readonly blurY?: number;
  readonly colors: ReadonlyArray<number>;
  readonly quality?: number;
  readonly ratios: ReadonlyArray<number>;
  readonly strength?: number;
}
