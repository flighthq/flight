import type { BlurFilter } from '@flighthq/types';

/**
 * Computes the CSS `filter` string for a blur filter, or `null` when the filter
 * has no CSS equivalent. CSS `blur()` is isotropic, so an anisotropic blur
 * (`blurX !== blurY`) and a zero-or-negative blur both return `null`.
 */
export function computeBlurFilterCss(filter: BlurFilter): string | null {
  const bx = filter.blurX ?? 4;
  const by = filter.blurY ?? 4;
  if (bx !== by) return null;
  if (bx <= 0) return null;
  return `blur(${bx}px)`;
}
