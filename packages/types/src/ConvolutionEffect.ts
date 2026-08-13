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
  // ★ 0xAARRGGBB — alpha in the HIGH byte, the only color in the SDK packed this way. Both the GL and
  // Wgpu runners read it as (>>16, >>8, &0xff) for RGB with (>>>24) for alpha. It is neither the packed
  // RGBA of most SDK colors nor the 24-bit RGB of the neighbouring effects. Default 0 (transparent).
  color?: number;
  divisor?: number;
  preserveAlpha?: boolean;
}
