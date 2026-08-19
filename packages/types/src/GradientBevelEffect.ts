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
   * ★ THE UNIT IS DEGREES HERE AND RADIANS ON SOME OTHER EFFECTS. `DirectionalBlurEffect.angle` and
   * `HalftoneEffect.angle` are radians; this family converts with `* Math.PI / 180` inside the runner.
   * The unit is stated on every angle field for that reason — naming only "radians" or only "degrees"
   * without the origin and sense is what let this whole class of defect through.
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
