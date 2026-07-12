import type { ColorLutAdjustment } from './ColorLutAdjustment';

export interface PosterizeAdjustment extends ColorLutAdjustment {
  kind: 'PosterizeAdjustment';
  levels?: number; // per-channel quantization steps. Default 8.
}
