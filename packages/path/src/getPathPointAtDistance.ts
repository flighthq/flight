import type { Path, Vector2Like } from '@flighthq/types';

import { flattenPath } from './flattenPath';

// Evaluates the point on the path at `distance` arc-length units from the start, writing it into
// `out`. Returns `true` if the distance is within the path's total length; `false` if the path is
// empty, in which case `out` is left unchanged.
//
// When `distance` exceeds the total path length, the result clamps to the final endpoint.
// When `distance` is negative, it clamps to the first endpoint.
//
// Curves are adaptively flattened to `tolerance` before measurement.
export function getPathPointAtDistance(
  path: Readonly<Path>,
  distance: number,
  out: Vector2Like,
  tolerance = 0.25,
): boolean {
  const contours = flattenPath(path, tolerance);
  return samplePathPoint(contours, distance, out);
}

// Evaluates both the point and the unit tangent at `distance`, writing results into `pointOut` and
// `tangentOut`. More efficient than calling both functions separately (one flatten pass).
export function getPathPositionAtDistance(
  path: Readonly<Path>,
  distance: number,
  pointOut: Vector2Like,
  tangentOut: Vector2Like,
  tolerance = 0.25,
): boolean {
  const contours = flattenPath(path, tolerance);
  const hasPoint = samplePathPoint(contours, distance, pointOut);
  samplePathTangent(contours, distance, tangentOut);
  return hasPoint;
}

// Evaluates the unit tangent direction of the path at `distance` arc-length units from the start,
// writing the result into `out`. Returns `true` on success, `false` for an empty path.
// The tangent is the normalized direction of the segment at `distance`. For degenerate zero-length
// segments the previous non-degenerate direction is reused; if none exists, (1, 0) is used.
export function getPathTangentAtDistance(
  path: Readonly<Path>,
  distance: number,
  out: Vector2Like,
  tolerance = 0.25,
): boolean {
  const contours = flattenPath(path, tolerance);
  return samplePathTangent(contours, distance, out);
}

// Shared arc-length walk: finds the point at `distance` across all contours.
function samplePathPoint(contours: Readonly<number[][]>, distance: number, out: Vector2Like): boolean {
  if (contours.length === 0) return false;
  let remaining = distance;
  for (let ci = 0; ci < contours.length; ci++) {
    const contour = contours[ci];
    if (contour.length < 2) continue;
    // Clamp to start of first contour.
    if (remaining <= 0) {
      out.x = contour[0];
      out.y = contour[1];
      return true;
    }
    for (let i = 2; i < contour.length; i += 2) {
      const dx = contour[i] - contour[i - 2];
      const dy = contour[i + 1] - contour[i - 1];
      const segLen = Math.sqrt(dx * dx + dy * dy);
      if (remaining <= segLen) {
        // Interpolate along this segment.
        const t = segLen > 0 ? remaining / segLen : 0;
        out.x = contour[i - 2] + t * dx;
        out.y = contour[i - 1] + t * dy;
        return true;
      }
      remaining -= segLen;
    }
  }
  // Clamped to the last endpoint.
  const last = contours[contours.length - 1];
  out.x = last[last.length - 2];
  out.y = last[last.length - 1];
  return true;
}

// Shared arc-length walk: finds the unit tangent at `distance` across all contours.
function samplePathTangent(contours: Readonly<number[][]>, distance: number, out: Vector2Like): boolean {
  if (contours.length === 0) {
    out.x = 1;
    out.y = 0;
    return false;
  }
  let remaining = distance;
  let lastTx = 1;
  let lastTy = 0;
  for (let ci = 0; ci < contours.length; ci++) {
    const contour = contours[ci];
    if (contour.length < 4) continue;
    for (let i = 2; i < contour.length; i += 2) {
      const dx = contour[i] - contour[i - 2];
      const dy = contour[i + 1] - contour[i - 1];
      const segLen = Math.sqrt(dx * dx + dy * dy);
      if (segLen > 0) {
        const invLen = 1 / segLen;
        lastTx = dx * invLen;
        lastTy = dy * invLen;
      }
      if (remaining <= segLen) {
        out.x = lastTx;
        out.y = lastTy;
        return true;
      }
      remaining -= segLen;
    }
  }
  out.x = lastTx;
  out.y = lastTy;
  return true;
}
