import { type BitmapFilter, filterToCSS } from './index';

/**
 * Applies a bitmap filter to `source` and draws the result onto `dest` at
 * (dx, dy) using the canvas 2D CSS filter path. Returns true if the filter
 * was applied; returns false if the filter has no CSS equivalent (inner
 * shadows, knockout, convolution, bevel, anisotropic blur). In that case
 * the caller should fall back to the surface or WebGL paths.
 *
 * The filter is applied via `ctx.filter` around a `drawImage` call, so it
 * benefits from the browser's GPU-accelerated filter pipeline.
 */
export function applyCanvasCSSFilter(
  dest: CanvasRenderingContext2D,
  source: CanvasImageSource,
  dx: number,
  dy: number,
  filter: BitmapFilter,
): boolean {
  const css = filterToCSS(filter);
  if (css === null) return false;
  dest.save();
  dest.filter = css;
  dest.drawImage(source, dx, dy);
  dest.restore();
  return true;
}
