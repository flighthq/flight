import type { BevelFilter, DropShadowFilter, InnerShadowFilter } from '@flighthq/types';

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
  const { dx, dy } = getShadowFilterOffset(filter);
  return `drop-shadow(${dx}px ${dy}px ${blurX}px ${rgbaFromInt(filter.color ?? 0, filter.alpha ?? 1)})`;
}

/**
 * Computes the pixel offset for shadow and bevel effects from angle and distance.
 * Angle is in degrees; 0 points right, increasing clockwise.
 */
export function getShadowFilterOffset(filter: DropShadowFilter | InnerShadowFilter | BevelFilter): {
  dx: number;
  dy: number;
} {
  const angle = ((filter.angle ?? 45) * Math.PI) / 180;
  const distance = filter.distance ?? 4;
  return {
    dx: Math.round(Math.cos(angle) * distance),
    dy: Math.round(Math.sin(angle) * distance),
  };
}

function rgbaFromInt(color: number, alpha: number): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}
