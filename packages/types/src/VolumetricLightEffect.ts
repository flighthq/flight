import type { RenderEffect } from './RenderEffect';
export interface VolumetricLightEffect extends RenderEffect {
  kind: 'VolumetricLightEffect';
  density?: number;
  // ★ ENCODING NOT FIXED: no backend runner reads this field. renderEffectDefaults supplies 0xffffffff,
  // which reads as packed RGBA, but nothing decodes it, so setting it has no effect on any backend and
  // the convention is only settled when a runner is written.
  lightColor?: number;
  /**
   * Horizontal light position as a fraction of the frame, 0 at the LEFT edge and 1 at the right.
   *
   * ★ NOT YET REALIZED: no backend runner reads this field, so the convention above is the intended
   * one rather than an observed one, and it is settled the day a runner is written.
   */
  lightX?: number;
  /**
   * Vertical light position as a fraction of the frame, 0 at the TOP edge and 1 at the bottom.
   *
   * Screen space: origin top-left, +Y down, angles measured from +X toward +Y — clockwise as
   * displayed. Each runner converts into its own texcoord space at its own seam.
   *
   * ★ NOT YET REALIZED: no backend runner reads this field, so a future runner on a bottom-left-origin
   * target must convert at its own seam, exactly as `RadialBlurEffect.centerY` and
   * `GodRaysEffect.centerY` do.
   */
  lightY?: number;
  samples?: number;
  scattering?: number;
}
