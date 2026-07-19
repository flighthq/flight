import type { InnerEffectSourceMode } from './EffectSourceMode';
import type { RenderEffect } from './RenderEffect';

// Inner-glow composite effect: tint the inverted silhouette, blur inward, clip to the source alpha, then draw or hide the source.
// Full-frame composite effect over the scene's alpha silhouette; colors are packed RGB integers with a
// separate alpha field (mirrors the Tier-1 filter recipe this realizes), angles are degrees.
export interface InnerGlowEffect extends RenderEffect {
  kind: 'InnerGlowEffect';
  alpha?: number;
  blurX?: number;
  blurY?: number;
  color?: number;
  quality?: number;
  sourceMode?: InnerEffectSourceMode;
  strength?: number;
}
