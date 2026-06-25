import type { BevelFilter, DropShadowFilter, InnerShadowFilter } from '@flighthq/types';

/**
 * Computes the pixel offset (dx, dy) for shadow and bevel effects from the
 * `angle` and `distance` fields on the filter. Angle is in degrees; 0 points
 * right and increases clockwise (matching Flash/OpenFL conventions). The result
 * is written into `out`; returns `out`.
 *
 * Used by every backend that needs to position or shift the shadow mask — the
 * calculation is shared so backends do not re-derive it independently.
 */
export function getShadowFilterOffset(
  filter: Readonly<DropShadowFilter | InnerShadowFilter | BevelFilter>,
  out: { dx: number; dy: number },
): { dx: number; dy: number } {
  const angle = ((filter.angle ?? 45) * Math.PI) / 180;
  const distance = filter.distance ?? 4;
  out.dx = Math.round(Math.cos(angle) * distance);
  out.dy = Math.round(Math.sin(angle) * distance);
  return out;
}
