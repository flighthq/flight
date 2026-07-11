import type { RenderEffect } from './RenderEffect';

// Drop-shadow composite effect: tint the scene silhouette, blur it, offset it by angle/distance, then composite the source over the shadow.
// Full-frame composite effect over the scene's alpha silhouette; colors are packed RGB integers with a
// separate alpha field (mirrors the Tier-1 filter recipe this realizes), angles are degrees.
export interface DropShadowEffect extends RenderEffect {
  kind: 'DropShadowEffect';
  alpha?: number;
  angle?: number;
  blurX?: number;
  blurY?: number;
  color?: number;
  distance?: number;
  hideObject?: boolean;
  knockout?: boolean;
  quality?: number;
  strength?: number;
}
