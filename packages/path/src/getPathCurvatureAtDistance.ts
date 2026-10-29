// Generated from crates/flight-path/src/get_path_curvature_at_distance.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { flattenPath } from './flattenPath.ts';
import type { PathRaw } from './path.ts';

function curvatureAtVertex(contour: Readonly<number[]>, count: number, vertex: number): number {
  if (count < 3) {
    return 0.0;
  }
  const middle = Math.max(1, Math.min(vertex, count - 2));
  return mengerCurvature(
    contour[(middle - 1) * 2],
    contour[(middle - 1) * 2 + 1],
    contour[middle * 2],
    contour[middle * 2 + 1],
    contour[(middle + 1) * 2],
    contour[(middle + 1) * 2 + 1],
  );
}

/**
 * Returns the signed curvature of the path at `distance` arc-length units from the start.
 * Positive curvature is a left turn in screen space (y-down). Returns 0 for empty paths,
 * straight segments, or degenerate geometry.
 */
export function getPathCurvatureAtDistance(path: Readonly<PathRaw>, distance: number, tolerance?: number): number {
  tolerance = tolerance ?? 0.25;
  const contours = flattenPath(path, tolerance);
  return samplePathCurvature(contours, distance);
}

function mengerCurvature(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): number {
  const ax = x1 - x0;
  const ay = y1 - y0;
  const bx = x2 - x1;
  const by = y2 - y1;
  const cross = ax * by - ay * bx;
  const a = Math.sqrt(ax * ax + ay * ay);
  const b = Math.sqrt(bx * bx + by * by);
  const cx = x2 - x0;
  const cy = y2 - y0;
  const c = Math.sqrt(cx * cx + cy * cy);
  const denom = a * b * c;
  if (denom === 0.0) {
    return 0.0;
  }
  return (2.0 * cross) / denom;
}

function samplePathCurvature(contours: Readonly<number[][]>, distance: number): number {
  if (contours.length === 0) {
    return 0.0;
  }
  let remaining = distance;
  for (let ci = 0; ci < contours.length; ci += 1) {
    const contour = contours[ci];
    const n = Math.trunc(contour.length / 2);
    if (n < 2) {
      continue;
    }
    if (remaining <= 0.0) {
      return curvatureAtVertex(contour, n, 0);
    }
    for (let i = 1; i < n; i += 1) {
      const dx = contour[i * 2] - contour[(i - 1) * 2];
      const dy = contour[i * 2 + 1] - contour[(i - 1) * 2 + 1];
      const segLen = Math.sqrt(dx * dx + dy * dy);
      if (remaining <= segLen) {
        const nearest = segLen === 0.0 || remaining * 2.0 >= segLen ? i : i - 1;
        return curvatureAtVertex(contour, n, nearest);
      }
      remaining -= segLen;
    }
  }
  const last = contours[contours.length - 1];
  const n = Math.trunc(last.length / 2);
  if (n < 3) {
    return 0.0;
  }
  return mengerCurvature(
    last[(n - 3) * 2],
    last[(n - 3) * 2 + 1],
    last[(n - 2) * 2],
    last[(n - 2) * 2 + 1],
    last[(n - 1) * 2],
    last[(n - 1) * 2 + 1],
  );
}
