import type { ColorLutAdjustment } from './ColorLutAdjustment';

export interface HueSaturationAdjustment extends ColorLutAdjustment {
  kind: 'HueSaturationAdjustment';
  hue?: number; // degrees of hue rotation. Default 0.
  saturation?: number; // saturation multiplier, 1 = unchanged. Default 1.
  lightness?: number; // additive lightness in [-1, 1], 0 = unchanged. Default 0.
}
