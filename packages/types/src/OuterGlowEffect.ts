import type { EffectSourceMode } from './EffectSourceMode';
import type { RenderEffect } from './RenderEffect';

// Outer-glow composite effect: tint the scene silhouette, blur it centered (no offset), then apply sourceMode compositing.
// Full-frame composite effect over the scene's alpha silhouette; the color is a packed RGBA integer
// whose alpha multiplies the separate alpha field, and angles are degrees.
export interface OuterGlowEffect extends RenderEffect {
  kind: 'OuterGlowEffect';
  alpha?: number;
  blurX?: number;
  blurY?: number;
  // Packed sRGB RGBA (`0xRRGGBBAA`), matching BitmapGlowOptions.color offscreen. Its alpha multiplies
  // the separate `alpha` field, folded in by the shared tint pass. Default 0xff0000ff.
  color?: number;
  quality?: number;
  sourceMode?: EffectSourceMode;
  strength?: number;
}
