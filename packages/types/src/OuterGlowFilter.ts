import type { BitmapFilter } from './BitmapFilter';

export interface OuterGlowFilter extends BitmapFilter {
  readonly kind: 'OuterGlowFilter';
  readonly alpha?: number;
  readonly blurX?: number;
  readonly blurY?: number;
  readonly color?: number;
  /** Composite only the glow, omitting the source from the output. */
  readonly knockout?: boolean;
  readonly quality?: number;
  readonly strength?: number;
}
