import type { EffectSourceMode } from './EffectSourceMode';
import type { RenderEffect } from './RenderEffect';

// Bevel composite effect: the directional gradient of the blurred silhouette drives a highlight/shadow edge band, clipped by bevelType, then applies sourceMode compositing.
// Full-frame composite effect over the scene's alpha silhouette; the highlight and shadow colors are
// packed RGBA integers whose alpha multiplies the matching *Alpha field, and angles are degrees.
export interface BevelEffect extends RenderEffect {
  kind: 'BevelEffect';
  angle?: number;
  bevelType?: 'full' | 'inner' | 'outer';
  blurX?: number;
  blurY?: number;
  distance?: number;
  highlightAlpha?: number;
  // Packed sRGB RGBA (`0xRRGGBBAA`), matching BitmapBevelOptions.highlightColor for the same operation
  // offscreen. Its alpha MULTIPLIES highlightAlpha, exactly as the bitmap tier multiplies by intensity.
  // Default 0xffffffff.
  highlightColor?: number;
  quality?: number;
  shadowAlpha?: number;
  // Packed sRGB RGBA (`0xRRGGBBAA`), matching BitmapBevelOptions.shadowColor. Its alpha MULTIPLIES
  // shadowAlpha. Default 0x000000ff.
  shadowColor?: number;
  sourceMode?: EffectSourceMode;
  strength?: number;
}
