import { getShadowFilterOffset } from '@flighthq/filters-math';
import type { DropShadowFilter } from '@flighthq/types';

/**
 * Computes the CSS `filter` string for a drop shadow filter, or `null` when the
 * filter has no CSS equivalent. A knockout shadow or an anisotropic blur
 * (`blurX !== blurY`) cannot be expressed with CSS `drop-shadow()` and returns
 * `null`.
 */
export function computeDropShadowFilterCss(filter: DropShadowFilter): string | null {
  if (filter.knockout) return null;
  const blurX = filter.blurX ?? 4;
  const blurY = filter.blurY ?? 4;
  if (blurX !== blurY) return null;
  // The angle/distance → (dx, dy) math is the shared, single-source helper from
  // @flighthq/filters-math; do not re-derive it here.
  const offset = { dx: 0, dy: 0 };
  getShadowFilterOffset(filter, offset);
  return `drop-shadow(${offset.dx}px ${offset.dy}px ${blurX}px ${rgbaFromInt(filter.color ?? 0, filter.alpha ?? 1)})`;
}

function rgbaFromInt(color: number, alpha: number): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}
