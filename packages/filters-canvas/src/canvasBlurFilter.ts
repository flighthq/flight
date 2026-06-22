import { computeBlurFilterCss } from '@flighthq/filters-css';
import type { BlurFilter } from '@flighthq/types';

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
  const css = computeBlurFilterCss(filter);
  if (css === null) return false;
  dest.save();
  dest.filter = css;
  dest.drawImage(source, dx, dy);
  dest.restore();
  return true;
}
