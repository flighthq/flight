import type { RenderEffect } from './RenderEffect';

export interface HalftoneEffect extends RenderEffect {
  kind: 'HalftoneEffect';
  scale?: number;
  /**
   * Rotation of the halftone dot grid, in DEGREES (default 45).
   *
   * Screen space: origin top-left, +Y down, angles measured from +X toward +Y — clockwise as
   * displayed. Each runner converts into its own texcoord space at its own seam.
   *
   * Only an angle that is not a multiple of a quarter turn can reveal a Y-origin error, because the
   * grid is symmetric under those; the default 45 is deliberately not one.
   */
  angle?: number;
}
