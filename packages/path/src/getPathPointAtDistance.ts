// Generated from crates/flight-path/src/get_path_point_at_distance.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { Vector2Like } from '@flighthq/geometry/contract';

import { flattenPath } from './flattenPath.ts';
import type { PathRaw } from './path.ts';

/**
 * Evaluates the point on the path at `distance` arc-length units from the start.
 * Returns `true` if the path has geometry; `false` for an empty path.
 */
export function getPathPointAtDistance(
  path: Readonly<PathRaw>,
  distance: number,
  out: Vector2Like,
  tolerance?: number,
): boolean {
  tolerance = tolerance ?? 0.25;
  const contours = flattenPath(path, tolerance);
  return samplePathPoint(contours, distance, out);
}

/**
 * Evaluates both the point and the unit tangent at `distance`.
 */
export function getPathPositionAtDistance(
  path: Readonly<PathRaw>,
  distance: number,
  pointOut: Vector2Like,
  tangentOut: Vector2Like,
  tolerance?: number,
): boolean {
  tolerance = tolerance ?? 0.25;
  const contours = flattenPath(path, tolerance);
  const hasPoint = samplePathPoint(contours, distance, pointOut);
  samplePathTangent(contours, distance, tangentOut);
  return hasPoint;
}

/**
 * Evaluates the unit tangent direction of the path at `distance` arc-length units.
 */
export function getPathTangentAtDistance(
  path: Readonly<PathRaw>,
  distance: number,
  out: Vector2Like,
  tolerance?: number,
): boolean {
  tolerance = tolerance ?? 0.25;
  const contours = flattenPath(path, tolerance);
  return samplePathTangent(contours, distance, out);
}

function samplePathPoint(contours: Readonly<number[][]>, distance: number, out: Vector2Like): boolean {
  if (contours.length === 0) {
    return false;
  }
  let remaining = distance;
  for (let ci = 0; ci < contours.length; ci += 1) {
    const contour = contours[ci];
    if (contour.length < 2) {
      continue;
    }
    if (remaining <= 0.0) {
      out.x = contour[0];
      out.y = contour[1];
      return true;
    }
    let i = 2;
    while (i < contour.length) {
      const dx = contour[i] - contour[i - 2];
      const dy = contour[i + 1] - contour[i - 1];
      const segLen = Math.sqrt(dx * dx + dy * dy);
      if (remaining <= segLen) {
        const t = segLen > 0.0 ? remaining / segLen : 0.0;
        out.x = contour[i - 2] + t * dx;
        out.y = contour[i - 1] + t * dy;
        return true;
      }
      remaining -= segLen;
      i += 2;
    }
  }
  const last = contours[contours.length - 1];
  out.x = last[last.length - 2];
  out.y = last[last.length - 1];
  return true;
}

function samplePathTangent(contours: Readonly<number[][]>, distance: number, out: Vector2Like): boolean {
  if (contours.length === 0) {
    out.x = 1.0;
    out.y = 0.0;
    return false;
  }
  let remaining = distance;
  let lastTx: number = 1.0;
  let lastTy: number = 0.0;
  for (let ci = 0; ci < contours.length; ci += 1) {
    const contour = contours[ci];
    if (contour.length < 4) {
      continue;
    }
    let i = 2;
    while (i < contour.length) {
      const dx = contour[i] - contour[i - 2];
      const dy = contour[i + 1] - contour[i - 1];
      const segLen = Math.sqrt(dx * dx + dy * dy);
      if (segLen > 0.0) {
        const invLen = 1.0 / segLen;
        lastTx = dx * invLen;
        lastTy = dy * invLen;
      }
      if (remaining <= segLen) {
        out.x = lastTx;
        out.y = lastTy;
        return true;
      }
      remaining -= segLen;
      i += 2;
    }
  }
  out.x = lastTx;
  out.y = lastTy;
  return true;
}
