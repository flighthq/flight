import type { EffectSourceMode } from './EffectSourceMode';
import type { RenderEffect } from './RenderEffect';

// Outer-glow composite effect: tint the scene silhouette, blur it centered (no offset), then apply sourceMode compositing.
// Full-frame composite effect over the scene's alpha silhouette; colors are packed RGB integers with a
// separate alpha field (mirrors the Tier-1 filter recipe this realizes), angles are degrees.
export interface OuterGlowEffect extends RenderEffect {
  kind: 'OuterGlowEffect';
  alpha?: number;
  blurX?: number;
  blurY?: number;
  // 24-bit RGB (`0xRRGGBB`) — opacity is the separate `alpha`. Default 0xff0000.
  color?: number;
  quality?: number;
  sourceMode?: EffectSourceMode;
  strength?: number;
}
