import type { EffectSourceMode } from './EffectSourceMode';
import type { RenderEffect } from './RenderEffect';

// Gradient-bevel composite effect: a bevel whose highlight→shadow band color is looked up from a colors/alphas/ratios gradient ramp indexed by the encoded bevel depth, then sourceMode decides source compositing.
// Full-frame composite effect over the scene's alpha silhouette; colors are packed RGB integers with a
// separate alpha field (mirrors the Tier-1 filter recipe this realizes), angles are degrees.
export interface GradientBevelEffect extends RenderEffect {
  kind: 'GradientBevelEffect';
  alphas: ReadonlyArray<number>;
  /**
   * Direction of the light that casts the bevel, in DEGREES (default 45).
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
  bevelType?: 'full' | 'inner' | 'outer';
  blurX?: number;
  blurY?: number;
  colors: ReadonlyArray<number>;
  /**
   * Length of the bevel offset in PIXELS along `angle` (default 4). A magnitude, so it carries no origin of
   * its own — the convention that decides where the offset LANDS lives on `angle`.
   */
  distance?: number;
  quality?: number;
  ratios: ReadonlyArray<number>;
  sourceMode?: EffectSourceMode;
  strength?: number;
}
