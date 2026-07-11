import type { RenderEffect } from './RenderEffect';

// Bevel composite effect: the directional gradient of the blurred silhouette drives a highlight/shadow edge band, clipped by bevelType and composited over the source.
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
  highlightColor?: number;
  knockout?: boolean;
  quality?: number;
  shadowAlpha?: number;
  shadowColor?: number;
  strength?: number;
}
