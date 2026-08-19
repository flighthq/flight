import type { RenderEffect } from './RenderEffect';

export interface DirectionalBlurEffect extends RenderEffect {
  kind: 'DirectionalBlurEffect';
  /**
   * Direction the frame is smeared along, in RADIANS (default 0).
   *
   * Screen space: origin top-left, +Y down, angles measured from +X toward +Y — clockwise as
   * displayed. Each runner converts into its own texcoord space at its own seam. 0 smears
   * HORIZONTALLY and Math.PI / 2 smears VERTICALLY DOWNWARD.
   *
   * ★ "radians" ALONE IS NOT A CONVENTION, and this field is where that became visible: the header
   * said the unit and nothing else, which reads as documented and is not. A blur axis is symmetric
   * under a half turn, so only an off-axis angle can show a Y-origin error here — which is why the
   * scene uses a diagonal one.
   */
  angle?: number;
  length?: number;
  samples?: number;
}
