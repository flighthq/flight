// Generated from crates/flight-path/src/get_path_signed_area.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { flattenPath } from './flattenPath.ts';
import type { PathRaw } from './path.ts';

/**
 * Contour orientation result.
 */
export type ContourOrientation = 'ccw' | 'cw' | 'degenerate';

/**
 * Returns the orientation of the path's primary (first) contour.
 */
export function getPathContourOrientation(path: Readonly<PathRaw>, tolerance?: number): ContourOrientation {
  tolerance = tolerance ?? 0.25;
  const contours = flattenPath(path, tolerance);
  if (contours.length === 0) {
    return 'degenerate';
  }
  const area = shoelaceArea(contours[0]);
  if (area > 0.0) {
    return 'ccw';
  }
  if (area < 0.0) {
    return 'cw';
  }
  return 'degenerate';
}

/**
 * Returns the signed area of the path (summed across all contours) by applying the shoelace
 * formula to the flattened contours.
 */
export function getPathSignedArea(path: Readonly<PathRaw>, tolerance?: number): number {
  tolerance = tolerance ?? 0.25;
  const contours = flattenPath(path, tolerance);
  let total: number = 0.0;
  for (let ci = 0; ci < contours.length; ci += 1) {
    total += shoelaceArea(contours[ci]);
  }
  return total;
}

function shoelaceArea(contour: Readonly<number[]>): number {
  const n = Math.trunc(contour.length / 2);
  if (n < 3) {
    return 0.0;
  }
  let area: number = 0.0;
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    area += contour[i * 2] * contour[j * 2 + 1];
    area -= contour[j * 2] * contour[i * 2 + 1];
  }
  return area / 2.0;
}
