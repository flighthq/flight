import type { RenderEffect } from './RenderEffect';

export interface BokehDepthOfFieldEffect extends RenderEffect {
  kind: 'BokehDepthOfFieldEffect'; // [DEPTH]
  focusDistance?: number;
  focusRange?: number;
  maxBlur?: number;
}
