import { computeOuterGlowFilterCss } from '@flighthq/filters-css';
import type { OuterGlowFilter } from '@flighthq/types';

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
  const css = computeOuterGlowFilterCss(filter);
  if (css === null) return false;
  dest.save();
  dest.filter = css;
  dest.drawImage(source, dx, dy);
  dest.restore();
  return true;
}
