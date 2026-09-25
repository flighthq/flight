import type { ColorMatrixAdjustment } from './ColorMatrixAdjustment.ts';

export interface GrayscaleAdjustment extends ColorMatrixAdjustment {
  kind: 'GrayscaleAdjustment';
  intensity?: number; // 0..1 mix toward luma (ITU-R BT.709). Default 1.
}
