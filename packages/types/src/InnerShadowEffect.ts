import type { InnerEffectSourceMode } from './EffectSourceMode';
import type { RenderEffect } from './RenderEffect';

// Inner-shadow composite effect: tint the inverted silhouette, blur, offset by angle/distance, clip to the source alpha, then draw or hide the source.
// Full-frame composite effect over the scene's alpha silhouette; colors are packed RGB integers with a
// separate alpha field (mirrors the Tier-1 filter recipe this realizes), angles are degrees.
export interface InnerShadowEffect extends RenderEffect {
  kind: 'InnerShadowEffect';
  alpha?: number;
  angle?: number;
  blurX?: number;
  blurY?: number;
  color?: number;
  distance?: number;
  quality?: number;
  sourceMode?: InnerEffectSourceMode;
  strength?: number;
}
