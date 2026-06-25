import type { Path } from '@flighthq/types';

import { flattenPath } from './flattenPath';

// Returns the orientation of the path's primary (first) contour: 'ccw', 'cw', or 'degenerate'
// (for zero-area paths such as a point or a straight line).
export function getPathContourOrientation(path: Readonly<Path>, tolerance = 0.25): 'ccw' | 'cw' | 'degenerate' {
  const contours = flattenPath(path, tolerance);
  if (contours.length === 0) return 'degenerate';
  const area = shoelaceArea(contours[0]);
  if (area > 0) return 'ccw';
  if (area < 0) return 'cw';
  return 'degenerate';
}

// Returns the signed area of the path (summed across all contours) by applying the shoelace formula
// to the flattened contours. Positive values indicate CCW winding (in a y-up coordinate system);
// negative values indicate CW winding (in y-down screen space). An empty path returns 0.
//
// The result is the algebraic (signed) area: contours that wind in opposite directions subtract
// from each other, which is the standard interpretation for evenOdd and nonZero fills with holes.
export function getPathSignedArea(path: Readonly<Path>, tolerance = 0.25): number {
  const contours = flattenPath(path, tolerance);
  let total = 0;
  for (let ci = 0; ci < contours.length; ci++) {
    total += shoelaceArea(contours[ci]);
  }
  return total;
}

// Shoelace (Gauss) formula for the signed area of a polygon given as a flat [x0,y0,x1,y1,...]
// coordinate array. Returns half the signed cross-product sum: positive = CCW (y-up), negative = CW.
function shoelaceArea(contour: Readonly<number[]>): number {
  const n = contour.length >> 1;
  if (n < 3) return 0;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += contour[i * 2] * contour[j * 2 + 1];
    area -= contour[j * 2] * contour[i * 2 + 1];
  }
  return area / 2;
}
