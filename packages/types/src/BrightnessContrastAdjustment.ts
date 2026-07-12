import type { ColorMatrixAdjustment } from './ColorMatrixAdjustment';

export interface BrightnessContrastAdjustment extends ColorMatrixAdjustment {
  kind: 'BrightnessContrastAdjustment';
  brightness?: number; // additive offset around mid-grey, 0 = neutral. Default 0.
  contrast?: number; // multiplier about mid-grey 0.5, 1 = neutral. Default 1.
}
