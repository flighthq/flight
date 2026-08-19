import type { EffectSourceMode } from './EffectSourceMode';
import type { RenderEffect } from './RenderEffect';

// Drop-shadow composite effect: tint the scene silhouette, blur it, offset it by angle/distance, then apply sourceMode compositing.
// Full-frame composite effect over the scene's alpha silhouette; the color is a packed RGBA integer
// whose alpha multiplies the separate alpha field, and angles are degrees.
export interface DropShadowEffect extends RenderEffect {
  kind: 'DropShadowEffect';
  alpha?: number;
  /**
   * Direction of the shadow offset, in DEGREES (default 45).
   *
   * Screen space: origin top-left, +Y down, angles measured from +X toward +Y — clockwise as
   * displayed. Each runner converts into its own texcoord space at its own seam. 0 offsets to
   * the RIGHT and 90 offsets DOWNWARD, the way an author reads the picture.
   *
   * ★ THE UNIT IS DEGREES HERE AND RADIANS ON SOME OTHER EFFECTS. `DirectionalBlurEffect.angle` and
   * `HalftoneEffect.angle` are radians; this family converts with `* Math.PI / 180` inside the runner.
   * The unit is stated on every angle field for that reason — naming only "radians" or only "degrees"
   * without the origin and sense is what let this whole class of defect through.
   */
  angle?: number;
  blurX?: number;
  blurY?: number;
  // Packed sRGB RGBA (`0xRRGGBBAA`), matching BitmapDropShadowOptions.color for the same operation
  // offscreen. Its alpha MULTIPLIES the separate `alpha` field, exactly as the bitmap tier multiplies
  // the color alpha by intensity. Default 0x000000ff.
  color?: number;
  /**
   * Length of the shadow offset in PIXELS along `angle` (default 4). A magnitude, so it carries no origin of
   * its own — the convention that decides where the offset LANDS lives on `angle`.
   */
  distance?: number;
  quality?: number;
  sourceMode?: EffectSourceMode;
  strength?: number;
}
