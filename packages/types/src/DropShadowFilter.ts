import type { BitmapFilter } from './BitmapFilter';

export interface DropShadowFilter extends BitmapFilter {
  readonly kind: 'DropShadowFilter';
  readonly alpha?: number;
  readonly angle?: number;
  readonly blurX?: number;
  readonly blurY?: number;
  readonly color?: number;
  readonly distance?: number;
  /** Render the shadow only, hiding the source object. */
  readonly hideObject?: boolean;
  /** Composite only the shadow, omitting the source from the output. */
  readonly knockout?: boolean;
  readonly quality?: number;
  readonly strength?: number;
}
