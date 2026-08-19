import type { EffectSourceMode } from './EffectSourceMode';
import type { RenderEffect } from './RenderEffect';

// Bevel composite effect: the directional gradient of the blurred silhouette drives a highlight/shadow edge band, clipped by bevelType, then applies sourceMode compositing.
// Full-frame composite effect over the scene's alpha silhouette; the highlight and shadow colors are
// packed RGBA integers whose alpha multiplies the matching *Alpha field, and angles are degrees.
export interface BevelEffect extends RenderEffect {
  kind: 'BevelEffect';
  /**
   * Direction of the light that casts the bevel, in DEGREES (default 45).
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
  bevelType?: 'full' | 'inner' | 'outer';
  blurX?: number;
  blurY?: number;
  /**
   * Length of the bevel offset in PIXELS along `angle` (default 4). A magnitude, so it carries no origin of
   * its own — the convention that decides where the offset LANDS lives on `angle`.
   */
  distance?: number;
  highlightAlpha?: number;
  // Packed sRGB RGBA (`0xRRGGBBAA`), matching BitmapBevelOptions.highlightColor for the same operation
  // offscreen. Its alpha MULTIPLIES highlightAlpha, exactly as the bitmap tier multiplies by intensity.
  // Default 0xffffffff.
  highlightColor?: number;
  quality?: number;
  shadowAlpha?: number;
  // Packed sRGB RGBA (`0xRRGGBBAA`), matching BitmapBevelOptions.shadowColor. Its alpha MULTIPLIES
  // shadowAlpha. Default 0x000000ff.
  shadowColor?: number;
  sourceMode?: EffectSourceMode;
  strength?: number;
}
