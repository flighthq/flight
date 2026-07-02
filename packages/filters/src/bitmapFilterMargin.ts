import { computeBoxBlurRadius } from '@flighthq/filters-math';
import type { BitmapFilter, BitmapFilterMargin } from '@flighthq/types';

import {
  isBevelFilter,
  isBlurFilter,
  isDropShadowFilter,
  isGradientBevelFilter,
  isGradientGlowFilter,
  isOuterGlowFilter,
} from './bitmapFilterGuards';
import {
  DEFAULT_FILTER_ANGLE,
  DEFAULT_FILTER_BLUR_X,
  DEFAULT_FILTER_BLUR_Y,
  DEFAULT_FILTER_DISTANCE,
} from './bitmapFilterOps';
import { getBlurPassCountForQuality } from './blurQuality';

/**
 * Computes the per-side pixel expansion a filter needs around the source bounds. The result is
 * the smallest bounding box that guarantees no rendered pixels are clipped. Backends use this to
 * size their intermediate surfaces; the actual rectangle expansion stays in the backends.
 *
 * Writes into `out` when provided (alias-safe: `out` may be any object). Returns `out` or a
 * newly-allocated object. Does not throw.
 *
 * Inner effects (InnerShadowFilter, InnerGlowFilter) always return zero on all sides — they paint
 * inside the source bounds. Colour-matrix, convolution, displacement, median, pixelate, and
 * sharpen filters also return zero — they transform pixels in place without expanding the bounds.
 *
 * Blur-radius expansion uses the single-pass box approximation (`computeBoxBlurRadius`) for the
 * given quality level, which matches what backends apply.
 */
export function getBitmapFilterMargin(filter: Readonly<BitmapFilter>, out?: BitmapFilterMargin): BitmapFilterMargin {
  const result = out ?? { top: 0, right: 0, bottom: 0, left: 0 };
  if (isBlurFilter(filter)) {
    const blurX = filter.blurX ?? DEFAULT_FILTER_BLUR_X;
    const blurY = filter.blurY ?? DEFAULT_FILTER_BLUR_Y;
    const passes = 1; // BlurFilter has no quality field — single pass
    const rx = computeBoxBlurRadius(blurX / 2, passes);
    const ry = computeBoxBlurRadius(blurY / 2, passes);
    result.top = ry;
    result.right = rx;
    result.bottom = ry;
    result.left = rx;
    return result;
  }
  if (isDropShadowFilter(filter)) {
    const blurX = filter.blurX ?? DEFAULT_FILTER_BLUR_X;
    const blurY = filter.blurY ?? DEFAULT_FILTER_BLUR_Y;
    const quality = filter.quality ?? 1;
    const angle = filter.angle ?? DEFAULT_FILTER_ANGLE;
    const distance = filter.distance ?? DEFAULT_FILTER_DISTANCE;
    const passes = getBlurPassCountForQuality(quality);
    const rx = computeBoxBlurRadius(blurX / 2, passes);
    const ry = computeBoxBlurRadius(blurY / 2, passes);
    const rad = (angle * Math.PI) / 180;
    const dx = Math.abs(Math.round(Math.cos(rad) * distance));
    const dy = Math.abs(Math.round(Math.sin(rad) * distance));
    result.top = ry + dy;
    result.right = rx + dx;
    result.bottom = ry + dy;
    result.left = rx + dx;
    return result;
  }
  if (
    isOuterGlowFilter(filter) ||
    isGradientGlowFilter(filter) ||
    isBevelFilter(filter) ||
    isGradientBevelFilter(filter)
  ) {
    const blurX = filter.blurX ?? DEFAULT_FILTER_BLUR_X;
    const blurY = filter.blurY ?? DEFAULT_FILTER_BLUR_Y;
    const quality = filter.quality ?? 1;
    const passes = getBlurPassCountForQuality(quality);
    const rx = computeBoxBlurRadius(blurX / 2, passes);
    const ry = computeBoxBlurRadius(blurY / 2, passes);
    result.top = ry;
    result.right = rx;
    result.bottom = ry;
    result.left = rx;
    return result;
  }
  // Inner effects (InnerGlowFilter, InnerShadowFilter) paint inside the source bounds, and
  // pixel-transform filters (ColorMatrix, Convolution, DisplacementMap, Median, Pixelate, Sharpen)
  // keep the output the same size as the input. Unknown custom kinds conservatively return zero.
  result.top = 0;
  result.right = 0;
  result.bottom = 0;
  result.left = 0;
  return result;
}
