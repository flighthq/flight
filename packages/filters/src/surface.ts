import {
  applySurfaceBevelFilter,
  applySurfaceBoxBlurFilter,
  applySurfaceColorMatrixFilter,
  applySurfaceConvolutionFilter,
  applySurfaceDisplacementMapFilter,
  applySurfaceDropShadowFilter,
  applySurfaceGlowFilter,
  applySurfaceGradientBevelFilter,
  applySurfaceGradientGlowFilter,
  applySurfaceInnerGlowFilter,
  applySurfaceInnerShadowFilter,
  applySurfaceMedianFilter,
  applySurfacePixelateFilter,
  applySurfaceSharpenFilter,
  buildSurfaceGradientRamp,
} from '@flighthq/surface-filters';
import type {
  BevelFilter,
  BlurFilter,
  ColorMatrixFilter,
  ConvolutionFilter,
  DisplacementMapFilter,
  DropShadowFilter,
  GradientBevelFilter,
  GradientGlowFilter,
  InnerGlowFilter,
  InnerShadowFilter,
  MedianFilter,
  OuterGlowFilter,
  PixelateFilter,
  SharpenFilter,
  SurfaceRegion,
} from '@flighthq/types';

import { computeBoxBlurRadius } from './math';

/**
 * Applies a bevel filter to `source`, writing the bevel mask into `out`.
 * Composite `out` over the original source to complete the effect.
 *
 * `blurBuffer` must be at least `source.width * source.height * 4` bytes and
 * must be distinct from `out`. `out` must not alias `source.surface.data`.
 */
export function applyBevelFilterToSurface(
  out: Uint8ClampedArray,
  blurBuffer: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  filter: BevelFilter,
): void {
  const quality = filter.quality ?? 1;
  const radiusX = computeBoxBlurRadius(filter.blurX ?? 4, quality);
  const radiusY = computeBoxBlurRadius(filter.blurY ?? 4, quality);
  const highlightColor = ((filter.highlightColor ?? 0xffffff) << 8) | Math.round((filter.highlightAlpha ?? 1) * 255);
  const shadowColor = ((filter.shadowColor ?? 0x000000) << 8) | Math.round((filter.shadowAlpha ?? 1) * 255);
  applySurfaceBevelFilter(out, blurBuffer, source, {
    angle: filter.angle,
    distance: filter.distance,
    highlightColor,
    intensity: filter.strength,
    passes: quality,
    radiusX,
    radiusY,
    shadowColor,
    type: filter.bevelType === 'full' ? 'both' : filter.bevelType,
  });
}

/**
 * Applies a box blur approximating Gaussian sigma to `source`, writing the
 * blurred result into `out`. `blurX` and `blurY` on the filter are Gaussian
 * standard deviations in pixels.
 *
 * `blurBuffer` must be at least `source.width * source.height * 4` bytes.
 * Safe to pass `source.surface.data` as `out` for a full-surface region.
 */
export function applyBlurFilterToSurface(
  out: Uint8ClampedArray,
  blurBuffer: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  filter: BlurFilter,
): void {
  const quality = filter.quality ?? 1;
  const radiusX = computeBoxBlurRadius(filter.blurX ?? 4, quality);
  const radiusY = computeBoxBlurRadius(filter.blurY ?? 4, quality);
  applySurfaceBoxBlurFilter(out, blurBuffer, source, {
    passes: quality,
    radiusX,
    radiusY,
  });
}

/**
 * Applies a 4×5 color matrix to `source`, writing the result into `out`.
 * `out` must be at least `source.width * source.height * 4` bytes.
 * Safe to pass `source.surface.data` as `out` for a full-surface region.
 */
export function applyColorMatrixFilterToSurface(
  out: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  filter: ColorMatrixFilter,
): void {
  applySurfaceColorMatrixFilter(out, source, filter.matrix);
}

/**
 * Applies a kernel convolution to `source`, writing the result into `out`.
 * `out` must not alias `source.surface.data`.
 */
export function applyConvolutionFilterToSurface(
  out: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  filter: ConvolutionFilter,
): void {
  applySurfaceConvolutionFilter(out, source, filter);
}

/**
 * Applies a displacement map warp to `source`, writing the result into `out`.
 * `map` supplies the per-pixel displacement vectors; its channels are selected
 * by `filter.componentX` and `filter.componentY`.
 *
 * `out` must not alias `source.surface.data`.
 */
export function applyDisplacementMapFilterToSurface(
  out: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  map: Readonly<SurfaceRegion>,
  filter: DisplacementMapFilter,
): void {
  applySurfaceDisplacementMapFilter(out, source, {
    componentX: filter.componentX,
    componentY: filter.componentY,
    fillColor: ((filter.color ?? 0) << 8) | Math.round((filter.alpha ?? 0) * 255),
    map,
    mode: filter.mode,
    scaleX: filter.scaleX,
    scaleY: filter.scaleY,
  });
}

/**
 * Produces the drop shadow mask for `source`, writing the tinted blurred alpha
 * mask into `out`. To complete the effect, composite `out` onto your destination
 * at the shadow offset (see `getShadowFilterOffset`), then composite the original
 * source on top (omit if `filter.hideObject` is true).
 *
 * `blurBuffer` must be at least `source.width * source.height * 4` bytes.
 * Safe to pass `source.surface.data` as `out` for a full-surface region.
 */
export function applyDropShadowFilterToSurface(
  out: Uint8ClampedArray,
  blurBuffer: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  filter: DropShadowFilter,
): void {
  const quality = filter.quality ?? 1;
  const radiusX = computeBoxBlurRadius(filter.blurX ?? 4, quality);
  const radiusY = computeBoxBlurRadius(filter.blurY ?? 4, quality);
  applySurfaceDropShadowFilter(out, blurBuffer, source, {
    color: ((filter.color ?? 0x000000) << 8) | Math.round((filter.alpha ?? 1) * 255),
    intensity: filter.strength,
    passes: quality,
    radiusX,
    radiusY,
  });
}

/**
 * Produces the gradient bevel mask for `source`, writing the result into `out`.
 * The gradient ramp is built from `filter.colors`, `filter.alphas`, and
 * `filter.ratios`. Composite `out` over the original source to complete the effect.
 *
 * `blurBuffer` must be at least `source.width * source.height * 4` bytes and
 * must be distinct from `out`. `out` must not alias `source.surface.data`.
 */
export function applyGradientBevelFilterToSurface(
  out: Uint8ClampedArray,
  blurBuffer: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  filter: GradientBevelFilter,
): void {
  const ramp = new Uint8ClampedArray(1024);
  buildSurfaceGradientRamp(ramp, filter.colors, filter.alphas, filter.ratios);
  const quality = filter.quality ?? 1;
  const radiusX = computeBoxBlurRadius(filter.blurX ?? 4, quality);
  const radiusY = computeBoxBlurRadius(filter.blurY ?? 4, quality);
  applySurfaceGradientBevelFilter(out, blurBuffer, source, ramp, {
    angle: filter.angle,
    distance: filter.distance,
    intensity: filter.strength,
    passes: quality,
    radiusX,
    radiusY,
    type: filter.bevelType === 'full' ? 'both' : filter.bevelType,
  });
}

/**
 * Produces the gradient glow mask for `source`, writing the result into `out`.
 * The gradient ramp is built from `filter.colors`, `filter.alphas`, and
 * `filter.ratios`. To complete the effect, composite `out` onto your destination,
 * then composite the original source on top.
 *
 * `blurBuffer` must be at least `source.width * source.height * 4` bytes.
 * Safe to pass `source.surface.data` as `out` for a full-surface region.
 */
export function applyGradientGlowFilterToSurface(
  out: Uint8ClampedArray,
  blurBuffer: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  filter: GradientGlowFilter,
): void {
  const ramp = new Uint8ClampedArray(1024);
  buildSurfaceGradientRamp(ramp, filter.colors, filter.alphas, filter.ratios);
  const quality = filter.quality ?? 1;
  const radiusX = computeBoxBlurRadius(filter.blurX ?? 4, quality);
  const radiusY = computeBoxBlurRadius(filter.blurY ?? 4, quality);
  applySurfaceGradientGlowFilter(out, blurBuffer, source, ramp, {
    intensity: filter.strength,
    passes: quality,
    radiusX,
    radiusY,
  });
}

/**
 * Produces the inner glow mask for `source`, writing the result into `out`.
 * To complete the effect, composite the original source first, then composite
 * `out` on top (the inner glow sits inside the shape boundary).
 *
 * `blurBuffer` must be at least `source.width * source.height * 4` bytes.
 * `out` must not alias `source.surface.data`.
 */
export function applyInnerGlowFilterToSurface(
  out: Uint8ClampedArray,
  blurBuffer: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  filter: InnerGlowFilter,
): void {
  const quality = filter.quality ?? 1;
  const radiusX = computeBoxBlurRadius(filter.blurX ?? 6, quality);
  const radiusY = computeBoxBlurRadius(filter.blurY ?? 6, quality);
  applySurfaceInnerGlowFilter(out, blurBuffer, source, {
    color: ((filter.color ?? 0xff0000) << 8) | Math.round((filter.alpha ?? 1) * 255),
    intensity: filter.strength,
    passes: quality,
    radiusX,
    radiusY,
  });
}

/**
 * Produces the inner shadow mask for `source`, writing the result into `out`.
 * To complete the effect, composite the original source first, then composite
 * `out` on top (the inner shadow sits inside the shape boundary).
 *
 * Note: the `angle` and `distance` fields on the filter are not yet applied by
 * the surface path — the shadow is centered on the shape boundary.
 *
 * `blurBuffer` must be at least `source.width * source.height * 4` bytes.
 * `out` must not alias `source.surface.data`.
 */
export function applyInnerShadowFilterToSurface(
  out: Uint8ClampedArray,
  blurBuffer: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  filter: InnerShadowFilter,
): void {
  const quality = filter.quality ?? 1;
  const radiusX = computeBoxBlurRadius(filter.blurX ?? 4, quality);
  const radiusY = computeBoxBlurRadius(filter.blurY ?? 4, quality);
  applySurfaceInnerShadowFilter(out, blurBuffer, source, {
    color: ((filter.color ?? 0x000000) << 8) | Math.round((filter.alpha ?? 1) * 255),
    intensity: filter.strength,
    passes: quality,
    radiusX,
    radiusY,
  });
}

/**
 * Applies a median filter to `source`, writing the result into `out`.
 * Each output pixel is the median of its neighborhood, preserving edges while
 * removing noise. `out` must not alias `source.surface.data`.
 */
export function applyMedianFilterToSurface(
  out: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  filter: MedianFilter,
): void {
  applySurfaceMedianFilter(out, source, filter.radius ?? 1);
}

/**
 * Produces the outer glow mask for `source`, writing the tinted blurred alpha
 * mask into `out`. To complete the effect, composite `out` onto your destination
 * first, then composite the original source on top (omit if `filter.knockout` is true).
 *
 * `blurBuffer` must be at least `source.width * source.height * 4` bytes.
 * Safe to pass `source.surface.data` as `out` for a full-surface region.
 */
export function applyOuterGlowFilterToSurface(
  out: Uint8ClampedArray,
  blurBuffer: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  filter: OuterGlowFilter,
): void {
  const quality = filter.quality ?? 1;
  const radiusX = computeBoxBlurRadius(filter.blurX ?? 6, quality);
  const radiusY = computeBoxBlurRadius(filter.blurY ?? 6, quality);
  applySurfaceGlowFilter(out, blurBuffer, source, {
    color: ((filter.color ?? 0xff0000) << 8) | Math.round((filter.alpha ?? 1) * 255),
    intensity: filter.strength,
    passes: quality,
    radiusX,
    radiusY,
  });
}

/**
 * Pixelates `source` into `out`, averaging each block of `filter.blockSize`
 * pixels into a single flat color.
 * `out` must be at least `source.width * source.height * 4` bytes.
 */
export function applyPixelateFilterToSurface(
  out: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  filter: PixelateFilter,
): void {
  applySurfacePixelateFilter(out, source, filter.blockSize ?? 8);
}

/**
 * Sharpens `source` into `out` using an unsharp mask. `blurX` and `blurY` on
 * the filter are Gaussian standard deviations of the unsharp mask blur.
 *
 * `blurBuffer` must be at least `source.width * source.height * 4` bytes.
 * `out` must not alias `source.surface.data`.
 */
export function applySharpenFilterToSurface(
  out: Uint8ClampedArray,
  blurBuffer: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  filter: SharpenFilter,
): void {
  const quality = filter.quality ?? 1;
  const radiusX = computeBoxBlurRadius(filter.blurX ?? 2, quality);
  const radiusY = computeBoxBlurRadius(filter.blurY ?? 2, quality);
  applySurfaceSharpenFilter(out, blurBuffer, source, {
    amount: filter.amount,
    passes: quality,
    radiusX,
    radiusY,
  });
}
