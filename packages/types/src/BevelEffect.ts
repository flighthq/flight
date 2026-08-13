import type { EffectSourceMode } from './EffectSourceMode';
import type { RenderEffect } from './RenderEffect';

// Bevel composite effect: the directional gradient of the blurred silhouette drives a highlight/shadow edge band, clipped by bevelType, then applies sourceMode compositing.
// Full-frame composite effect over the scene's alpha silhouette; colors are packed RGB integers with a
// separate alpha field (mirrors the Tier-1 filter recipe this realizes), angles are degrees.
export interface BevelEffect extends RenderEffect {
  kind: 'BevelEffect';
  angle?: number;
  bevelType?: 'full' | 'inner' | 'outer';
  blurX?: number;
  blurY?: number;
  distance?: number;
  highlightAlpha?: number;
  // 24-bit RGB (`0xRRGGBB`) — opacity is highlightAlpha, not a fourth channel. Default 0xffffff.
  // ★ NOT the packed RGBA BitmapBevelOptions.highlightColor carries for the same operation offscreen.
  highlightColor?: number;
  quality?: number;
  shadowAlpha?: number;
  // 24-bit RGB (`0xRRGGBB`) — opacity is shadowAlpha, not a fourth channel. Default 0x000000.
  shadowColor?: number;
  sourceMode?: EffectSourceMode;
  strength?: number;
}
