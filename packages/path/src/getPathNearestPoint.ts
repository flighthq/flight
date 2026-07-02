import type { Path, Vector2Like } from '@flighthq/types';

import { flattenPath } from './flattenPath';

// Finds the closest point on `path` to (px, py), writing the result into `out`. Returns the
// distance from (px, py) to the nearest point. Returns -1 and leaves `out` unchanged for an
// empty path. Curves are adaptively flattened to `tolerance` before the query.
export function getPathNearestPoint(
  path: Readonly<Path>,
  px: number,
  py: number,
  out: Vector2Like,
  tolerance = 0.25,
): number {
  const contours = flattenPath(path, tolerance);
  let bestDistSq = Infinity;
  let bestX = 0;
  let bestY = 0;

  for (let ci = 0; ci < contours.length; ci++) {
    const contour = contours[ci];
    for (let i = 2; i < contour.length; i += 2) {
      const ax = contour[i - 2];
      const ay = contour[i - 1];
      const bx = contour[i];
      const by = contour[i + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const lenSq = dx * dx + dy * dy;
      let t: number;
      if (lenSq === 0) {
        t = 0;
      } else {
        t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
      }
      const cx = ax + t * dx;
      const cy = ay + t * dy;
      const distSq = (px - cx) * (px - cx) + (py - cy) * (py - cy);
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestX = cx;
        bestY = cy;
      }
    }
  }

  if (bestDistSq === Infinity) return -1;
  out.x = bestX;
  out.y = bestY;
  return Math.sqrt(bestDistSq);
}
