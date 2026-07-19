import type { EffectSourceMode } from './EffectSourceMode';
import type { RenderEffect } from './RenderEffect';

// Gradient-glow composite effect: an outer glow whose color is looked up from a colors/alphas/ratios gradient ramp indexed by the blurred silhouette alpha, then sourceMode decides source compositing.
// Full-frame composite effect over the scene's alpha silhouette; colors are packed RGB integers with a
// separate alpha field (mirrors the Tier-1 filter recipe this realizes), angles are degrees.
export interface GradientGlowEffect extends RenderEffect {
  kind: 'GradientGlowEffect';
  alphas: ReadonlyArray<number>;
  blurX?: number;
  blurY?: number;
  colors: ReadonlyArray<number>;
  quality?: number;
  ratios: ReadonlyArray<number>;
  sourceMode?: EffectSourceMode;
  strength?: number;
}
