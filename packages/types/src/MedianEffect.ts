import type { RenderEffect } from './RenderEffect';

// Per-channel median denoise: each output pixel is the median of its (2·radius+1)² neighborhood,
// removing salt-and-pepper noise while preserving edges. A spatial Effect (it reads neighbors), so
// it is realized as an offscreen pass. `radius` defaults to 1 (a 3×3 window).
export interface MedianEffect extends RenderEffect {
  kind: 'MedianEffect';
  radius?: number;
}
