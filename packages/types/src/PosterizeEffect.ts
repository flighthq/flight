import type { RenderEffect } from './RenderEffect';

export interface PosterizeEffect extends RenderEffect {
  kind: 'PosterizeEffect';
  levels?: number; // per-channel quantization steps. Default 8.
}
