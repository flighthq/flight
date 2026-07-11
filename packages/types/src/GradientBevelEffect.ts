import type { RenderEffect } from './RenderEffect';

// Gradient-bevel composite effect: a bevel whose highlight→shadow band color is looked up from a colors/alphas/ratios gradient ramp indexed by the encoded bevel depth.
// Full-frame composite effect over the scene's alpha silhouette; colors are packed RGB integers with a
// separate alpha field (mirrors the Tier-1 filter recipe this realizes), angles are degrees.
export interface GradientBevelEffect extends RenderEffect {
  kind: 'GradientBevelEffect';
  alphas: ReadonlyArray<number>;
  angle?: number;
  bevelType?: 'full' | 'inner' | 'outer';
  blurX?: number;
  blurY?: number;
  colors: ReadonlyArray<number>;
  distance?: number;
  quality?: number;
  ratios: ReadonlyArray<number>;
  strength?: number;
}
