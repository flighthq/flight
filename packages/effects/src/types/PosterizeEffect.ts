import type { Effect } from './Effect.ts';

export interface PosterizeEffect extends Effect {
  kind: 'PosterizeEffect';
  levels?: number; // per-channel quantization steps. Default 8.
}
