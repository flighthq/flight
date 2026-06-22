import type { RenderEffect } from './RenderEffect';

export interface FxaaEffect extends RenderEffect {
  kind: 'FxaaEffect';
  // Edge contrast threshold; lower catches more edges. Default 0.0312.
  edgeThreshold?: number;
  subpixel?: number;
}
