import { computeDropShadowFilterCss } from '@flighthq/filters';
import type { DropShadowFilter } from '@flighthq/types';

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
  const css = computeDropShadowFilterCss(filter);
  if (css === null) return false;
  dest.save();
  dest.filter = css;
  dest.drawImage(source, dx, dy);
  dest.restore();
  return true;
}
