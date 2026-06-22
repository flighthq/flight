import type { BitmapFilter } from './BitmapFilter';

export type DisplacementMapMode = 'clamp' | 'color' | 'ignore' | 'wrap';

export interface DisplacementMapFilter extends BitmapFilter {
  readonly kind: 'DisplacementMapFilter';
  /** Fill alpha (0..1) used when mode is 'color'. Default 0. */
  readonly alpha?: number;
  /** Packed RGB fill used when mode is 'color'. Default 0. */
  readonly color?: number;
  /** Channel index (0=R, 1=G, 2=B, 3=A) of the displacement map that drives X offset. Default 0. */
  readonly componentX?: number;
  /** Channel index (0=R, 1=G, 2=B, 3=A) of the displacement map that drives Y offset. Default 1. */
  readonly componentY?: number;
  /** How to handle sample positions that fall outside the source. Default 'wrap'. */
  readonly mode?: DisplacementMapMode;
  /** X displacement scale. A map value of 128 is neutral (no shift). Default 0. */
  readonly scaleX?: number;
  /** Y displacement scale. Default 0. */
  readonly scaleY?: number;
}
