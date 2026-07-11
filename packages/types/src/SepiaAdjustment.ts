import type { ColorMatrixAdjustment } from './ColorMatrixAdjustment';

export interface SepiaAdjustment extends ColorMatrixAdjustment {
  kind: 'SepiaAdjustment';
  intensity?: number; // 0..1 mix toward the sepia tone. Default 1.
}
