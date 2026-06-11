import type { BevelFilter, BlurFilter, DropShadowFilter, InnerShadowFilter, OuterGlowFilter } from '@flighthq/types';

export function blurFilterToCSS(filter: BlurFilter): string | null {
  const bx = filter.blurX ?? 4;
  const by = filter.blurY ?? 4;
  if (bx !== by) return null;
  if (bx <= 0) return null;
  return `blur(${bx}px)`;
}

export function dropShadowFilterToCSS(filter: DropShadowFilter): string | null {
  if (filter.knockout) return null;
  const blurX = filter.blurX ?? 4;
  const blurY = filter.blurY ?? 4;
  if (blurX !== blurY) return null;
  const { dx, dy } = filterShadowOffset(filter);
  return `drop-shadow(${dx}px ${dy}px ${blurX}px ${rgbaFromInt(filter.color ?? 0, filter.alpha ?? 1)})`;
}

/**
 * Computes the pixel offset for shadow and bevel effects from angle and distance.
 * Angle is in degrees; 0 points right, increasing clockwise.
 */
export function filterShadowOffset(filter: DropShadowFilter | InnerShadowFilter | BevelFilter): {
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

export function outerGlowFilterToCSS(filter: OuterGlowFilter): string | null {
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
