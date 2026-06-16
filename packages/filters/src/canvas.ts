import type { BlurFilter, DropShadowFilter, OuterGlowFilter } from '@flighthq/types';

import { computeBlurFilterCSS, computeDropShadowFilterCSS, computeOuterGlowFilterCSS } from './css';

/**
 * Applies a blur filter to `source` and draws the result onto `dest` at (dx, dy)
 * via the canvas 2D CSS filter path. Returns false if the filter has no CSS
 * equivalent (anisotropic blur where blurX !== blurY).
 */
export function applyBlurFilterToCanvas(
  dest: CanvasRenderingContext2D,
  source: CanvasImageSource,
  dx: number,
  dy: number,
  filter: BlurFilter,
): boolean {
  const css = computeBlurFilterCSS(filter);
  if (css === null) return false;
  dest.save();
  dest.filter = css;
  dest.drawImage(source, dx, dy);
  dest.restore();
  return true;
}

/**
 * Applies a drop shadow filter to `source` and draws the result onto `dest` at
 * (dx, dy) via the canvas 2D CSS filter path. Returns false if the filter has no
 * CSS equivalent (knockout, anisotropic blur).
 */
export function applyDropShadowFilterToCanvas(
  dest: CanvasRenderingContext2D,
  source: CanvasImageSource,
  dx: number,
  dy: number,
  filter: DropShadowFilter,
): boolean {
  const css = computeDropShadowFilterCSS(filter);
  if (css === null) return false;
  dest.save();
  dest.filter = css;
  dest.drawImage(source, dx, dy);
  dest.restore();
  return true;
}

/**
 * Applies an outer glow filter to `source` and draws the result onto `dest` at
 * (dx, dy) via the canvas 2D CSS filter path. Returns false if the filter has no
 * CSS equivalent (knockout, anisotropic blur).
 */
export function applyOuterGlowFilterToCanvas(
  dest: CanvasRenderingContext2D,
  source: CanvasImageSource,
  dx: number,
  dy: number,
  filter: OuterGlowFilter,
): boolean {
  const css = computeOuterGlowFilterCSS(filter);
  if (css === null) return false;
  dest.save();
  dest.filter = css;
  dest.drawImage(source, dx, dy);
  dest.restore();
  return true;
}
