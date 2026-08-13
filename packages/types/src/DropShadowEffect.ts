import type { EffectSourceMode } from './EffectSourceMode';
import type { RenderEffect } from './RenderEffect';

// Drop-shadow composite effect: tint the scene silhouette, blur it, offset it by angle/distance, then apply sourceMode compositing.
// Full-frame composite effect over the scene's alpha silhouette; the color is a packed RGBA integer
// whose alpha multiplies the separate alpha field, and angles are degrees.
export interface DropShadowEffect extends RenderEffect {
  kind: 'DropShadowEffect';
  alpha?: number;
  angle?: number;
  blurX?: number;
  blurY?: number;
  // Packed sRGB RGBA (`0xRRGGBBAA`), matching BitmapDropShadowOptions.color for the same operation
  // offscreen. Its alpha MULTIPLIES the separate `alpha` field, exactly as the bitmap tier multiplies
  // the color alpha by intensity. Default 0x000000ff.
  color?: number;
  distance?: number;
  quality?: number;
  sourceMode?: EffectSourceMode;
  strength?: number;
}
