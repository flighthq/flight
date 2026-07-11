import type { RenderEffect } from './RenderEffect';

// Outer-glow composite effect: tint the scene silhouette, blur it centered (no offset), then composite the source over the glow.
// Full-frame composite effect over the scene's alpha silhouette; colors are packed RGB integers with a
// separate alpha field (mirrors the Tier-1 filter recipe this realizes), angles are degrees.
export interface OuterGlowEffect extends RenderEffect {
  kind: 'OuterGlowEffect';
  alpha?: number;
  blurX?: number;
  blurY?: number;
  color?: number;
  knockout?: boolean;
  quality?: number;
  strength?: number;
}
