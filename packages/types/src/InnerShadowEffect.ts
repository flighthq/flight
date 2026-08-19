import type { InnerEffectSourceMode } from './EffectSourceMode';
import type { RenderEffect } from './RenderEffect';

// Inner-shadow composite effect: tint the inverted silhouette, blur, offset by angle/distance, clip to the source alpha, then draw or hide the source.
// Full-frame composite effect over the scene's alpha silhouette; the color is a packed RGBA integer
// whose alpha multiplies the separate alpha field, and angles are degrees.
export interface InnerShadowEffect extends RenderEffect {
  kind: 'InnerShadowEffect';
  alpha?: number;
  /**
   * Direction of the inner shadow offset, in DEGREES (default 45).
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
  // Packed sRGB RGBA (`0xRRGGBBAA`), matching BitmapInnerShadowOptions.color offscreen. Its alpha
  // multiplies the separate `alpha` field before the edge premultiply. Default 0x000000ff.
  color?: number;
  /**
   * Length of the inner shadow offset in PIXELS along `angle` (default 4). A magnitude, so it carries no origin of
   * its own — the convention that decides where the offset LANDS lives on `angle`.
   */
  distance?: number;
  quality?: number;
  sourceMode?: InnerEffectSourceMode;
  strength?: number;
}
