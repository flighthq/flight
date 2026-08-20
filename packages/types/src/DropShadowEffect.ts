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
   * ★ THE UNIT IS STATED ON EVERY ANGLE FIELD IN THE SDK, and this family is why. `DirectionalBlurEffect`
   * and `HalftoneEffect` carried radians here while these four carried degrees, with nothing in either
   * header saying so; they are all degrees now. Naming only "radians" or only "degrees" without the
   * origin and sense is what let the whole class of defect through in the first place.
   *
   * A runner converting this to radians uses `DEG_TO_RAD` from `@flighthq/math`, never a hand-rolled
   * `Math.PI / 180`: the two are not interchangeable in general, because multiply-first and
   * divide-first forms disagree by about 1 ULP on roughly 29 per cent of values, and a rasterization
   * decision can turn on that.
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
