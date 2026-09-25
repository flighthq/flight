import type { ColorMatrixAdjustment } from './ColorMatrixAdjustment.ts';

export interface InvertAdjustment extends ColorMatrixAdjustment {
  kind: 'InvertAdjustment';
  intensity?: number; // 0 = original, 1 = fully inverted. Default 1.
}
