import type { ColorMatrixAdjustment } from './ColorMatrixAdjustment';
import type { ColorScaleBiasLike } from './ColorScaleBias';

// Explicit per-channel `out = in * scale + bias` adjustment. Biases are normalized-linear, unbounded
// floats. `colorMatrix` is carried alongside the legible payload so it fuses through the same
// matrix-tier path as every semantic adjustment.
export interface ColorScaleBiasAdjustment extends ColorMatrixAdjustment {
  colorScaleBias: Readonly<ColorScaleBiasLike>;
  kind: 'ColorScaleBiasAdjustment';
}
