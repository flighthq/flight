import type { OuterGlowFilter } from '@flighthq/types';

/**
 * Computes the CSS `filter` string for an outer glow filter, or `null` when the
 * filter has no CSS equivalent. An outer glow renders as a centered
 * `drop-shadow()`; a knockout glow or an anisotropic blur (`blurX !== blurY`)
 * returns `null`.
 */
export function computeOuterGlowFilterCss(filter: OuterGlowFilter): string | null {
  if (filter.knockout) return null;
  const blurX = filter.blurX ?? 6;
  const blurY = filter.blurY ?? 6;
  if (blurX !== blurY) return null;
  return `drop-shadow(0px 0px ${blurX}px ${rgbaFromInt(filter.color ?? 0xff0000, filter.alpha ?? 1)})`;
}

function rgbaFromInt(color: number, alpha: number): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}
