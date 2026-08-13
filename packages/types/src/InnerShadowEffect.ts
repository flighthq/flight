import type { InnerEffectSourceMode } from './EffectSourceMode';
import type { RenderEffect } from './RenderEffect';

// Inner-shadow composite effect: tint the inverted silhouette, blur, offset by angle/distance, clip to the source alpha, then draw or hide the source.
// Full-frame composite effect over the scene's alpha silhouette; the color is a packed RGBA integer
// whose alpha multiplies the separate alpha field, and angles are degrees.
export interface InnerShadowEffect extends RenderEffect {
  kind: 'InnerShadowEffect';
  alpha?: number;
  angle?: number;
  blurX?: number;
  blurY?: number;
  // Packed sRGB RGBA (`0xRRGGBBAA`), matching BitmapInnerShadowOptions.color offscreen. Its alpha
  // multiplies the separate `alpha` field before the edge premultiply. Default 0x000000ff.
  color?: number;
  distance?: number;
  quality?: number;
  sourceMode?: InnerEffectSourceMode;
  strength?: number;
}
