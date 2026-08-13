import type { RenderEffect } from './RenderEffect';

// Generic matrix-kernel convolution: each output pixel is the weighted sum of its
// matrixX×matrixY neighborhood. A spatial Effect (it reads neighbors), so it is realized as an
// offscreen pass rather than folded into the draw. `divisor` normalizes the weighted sum (defaults
// to the matrix sum, or 1 when that sum is 0); `bias` is added in the 0–255 range; `preserveAlpha`
// keeps the source alpha; `clamp` extends edge pixels, otherwise out-of-bounds taps read `color`.
export interface ConvolutionEffect extends RenderEffect {
  kind: 'ConvolutionEffect';
  matrix: ReadonlyArray<number>;
  matrixX: number;
  matrixY: number;
  bias?: number;
  clamp?: boolean;
  // Packed sRGB RGBA (`0xRRGGBBAA`), the color sampled outside the source when `clamp` is false. Both
  // backend runners decode it through unpackColorRgba, so the channel order is the shared helper's, not
  // an open-coded shift. Default 0 — transparent black, unchanged in meaning by the migration from the
  // 0xAARRGGBB packing this field used to carry.
  color?: number;
  divisor?: number;
  preserveAlpha?: boolean;
}
