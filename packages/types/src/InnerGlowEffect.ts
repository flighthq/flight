import type { InnerEffectSourceMode } from './EffectSourceMode';
import type { RenderEffect } from './RenderEffect';

// Inner-glow composite effect: tint the inverted silhouette, blur inward, clip to the source alpha, then draw or hide the source.
// Full-frame composite effect over the scene's alpha silhouette; the color is a packed RGBA integer
// whose alpha multiplies the separate alpha field, and angles are degrees.
export interface InnerGlowEffect extends RenderEffect {
  kind: 'InnerGlowEffect';
  alpha?: number;
  blurX?: number;
  blurY?: number;
  // Packed sRGB RGBA (`0xRRGGBBAA`), matching BitmapInnerGlowOptions.color offscreen. Its alpha
  // multiplies the separate `alpha` field before the edge premultiply. Default 0xff0000ff.
  color?: number;
  quality?: number;
  sourceMode?: InnerEffectSourceMode;
  strength?: number;
}
