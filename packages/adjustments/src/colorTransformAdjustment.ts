import type { ColorTransform, ColorTransformAdjustment } from '@flighthq/types';

// The node-level color transform as a matrix-tier adjustment — the first member of a node's generic
// color-adjustment stack. It keeps the 8-field `ColorTransform` payload and bakes it into a
// diagonal-affine 4×5 `colorMatrix` (offset column in the 0–255 convention, matching colorMatrixMath) so
// it fuses with other matrix-tier adjustments; the inline fold reads the ColorTransform payload back (or,
// for a multi-op stack, the fused matrix resolved to an affine ColorTransform).
export function createColorTransformAdjustment(colorTransform: Readonly<ColorTransform>): ColorTransformAdjustment {
  // prettier-ignore
  const colorMatrix = [
    colorTransform.redMultiplier, 0, 0, 0, colorTransform.redOffset,
    0, colorTransform.greenMultiplier, 0, 0, colorTransform.greenOffset,
    0, 0, colorTransform.blueMultiplier, 0, colorTransform.blueOffset,
    0, 0, 0, colorTransform.alphaMultiplier, colorTransform.alphaOffset,
  ];
  return { kind: 'ColorTransformAdjustment', colorTransform: colorTransform as ColorTransform, colorMatrix };
}
