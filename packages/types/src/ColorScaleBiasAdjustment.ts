import type { ColorMatrixAdjustment } from './ColorMatrixAdjustment';
import type { ColorScaleBiasLike } from './ColorScaleBias';

// Flash/OpenFL bridge for a per-channel `out = in * scale + bias` value. Biases are normalized-linear,
// unbounded floats. `colorMatrix` is carried alongside the legible bridge payload so it fuses through
// the same matrix-tier path as every semantic adjustment.
export interface ColorScaleBiasAdjustment extends ColorMatrixAdjustment {
  colorScaleBias: Readonly<ColorScaleBiasLike>;
  kind: 'ColorScaleBiasAdjustment';
}
