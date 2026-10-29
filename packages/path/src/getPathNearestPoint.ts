// Generated from crates/flight-path/src/get_path_nearest_point.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { Vector2Like } from '@flighthq/geometry/contract';

import { flattenPath } from './flattenPath.ts';
import type { PathRaw } from './path.ts';

/**
 * Finds the closest point on `path` to (px, py), writing the result into `out`.
 * Returns the distance from (px, py) to the nearest point. Returns -1 and leaves
 * `out` unchanged for an empty path.
 */
export function getPathNearestPoint(
  path: Readonly<PathRaw>,
  px: number,
  py: number,
  out: Vector2Like,
  tolerance?: number,
): number {
  tolerance = tolerance ?? 0.25;
  const contours = flattenPath(path, tolerance);
  let bestDistSq = Number.POSITIVE_INFINITY;
  let bestX: number = 0.0;
  let bestY: number = 0.0;
  for (let ci = 0; ci < contours.length; ci += 1) {
    const contour = contours[ci];
    let i = 2;
    while (i < contour.length) {
      const ax = contour[i - 2];
      const ay = contour[i - 1];
      const bx = contour[i];
      const by = contour[i + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const lenSq = dx * dx + dy * dy;
      let t;
      if (lenSq === 0.0) {
        t = 0.0;
      } else {
        const raw = ((px - ax) * dx + (py - ay) * dy) / lenSq;
        t = raw < 0.0 ? 0.0 : raw > 1.0 ? 1.0 : raw;
      }
      const cx = ax + t * dx;
      const cy = ay + t * dy;
      const distSq = (px - cx) * (px - cx) + (py - cy) * (py - cy);
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestX = cx;
        bestY = cy;
      }
      i += 2;
    }
  }
  if (bestDistSq === Number.POSITIVE_INFINITY) {
    return -1.0;
  }
  out.x = bestX;
  out.y = bestY;
  return Math.sqrt(bestDistSq);
}
