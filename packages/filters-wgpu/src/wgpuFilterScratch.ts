import type { BitmapFilter } from '@flighthq/types';

/**
 * Returns the number of scratch `WgpuRenderTarget` entries required to apply
 * the given filter descriptor via its `apply*FilterToWgpu` function.
 *
 * Scratch targets must all be the same size as `dest`. Pass an array of this
 * length to the filter's `scratch` parameter; pass fewer and the filter will
 * index out of bounds.
 *
 * Filters that take no scratch (colorMatrix, convolution, displacementMap,
 * median, pixelate) return 0. All blur-derived effects return 3 (tint/mask,
 * blurred output, blur ping-pong). Sharpen returns 2 (blurred image, blur
 * ping-pong). BlurFilter itself only needs 1 (ping-pong temp, passed directly).
 *
 * Returns 0 for unknown kinds — callers integrating custom kinds should handle
 * the 0 case defensively.
 */
export function getWgpuFilterScratchCount(filter: Readonly<BitmapFilter>): number {
  switch (filter.kind) {
    // Single-pass filters — no scratch needed.
    case 'ColorMatrixFilter':
    case 'ConvolutionFilter':
    case 'DisplacementMapFilter':
    case 'MedianFilter':
    case 'PixelateFilter':
      return 0;
    // BlurFilter: one ping-pong temp target (passed as `temp`, not `scratch[]`).
    // The apply*BlurFilter functions take `temp` directly, not `scratch[]`, so
    // formally they need 1 target. Report 1 so callers can allocate consistently.
    case 'BlurFilter':
      return 1;
    // Sharpen: blurred copy + blur ping-pong.
    case 'SharpenFilter':
      return 2;
    // Blur-derived effects: tint/mask, blurred output, blur ping-pong.
    case 'BevelFilter':
    case 'DropShadowFilter':
    case 'GradientBevelFilter':
    case 'GradientGlowFilter':
    case 'InnerGlowFilter':
    case 'InnerShadowFilter':
    case 'OuterGlowFilter':
      return 3;
    default:
      return 0;
  }
}
