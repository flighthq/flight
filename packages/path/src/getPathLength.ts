import type { Path } from '@flighthq/types';

import { flattenPath } from './flattenPath';

// Returns the total arc length of `path` by summing the Euclidean lengths of all flattened segments.
// Curves are adaptively approximated to `tolerance` path units before measurement.
// An empty path returns 0.
export function getPathLength(path: Readonly<Path>, tolerance = 0.25): number {
  const contours = flattenPath(path, tolerance);
  let total = 0;
  for (let ci = 0; ci < contours.length; ci++) {
    total += contourLength(contours[ci]);
  }
  return total;
}

// Returns the summed Euclidean length of the polyline segments in one flattened contour.
function contourLength(contour: Readonly<number[]>): number {
  let len = 0;
  for (let i = 2; i < contour.length; i += 2) {
    const dx = contour[i] - contour[i - 2];
    const dy = contour[i + 1] - contour[i - 1];
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return len;
}
