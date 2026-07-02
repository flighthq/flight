import type { Path } from '@flighthq/types';

import { flattenPath } from './flattenPath';

// Returns an array of arc lengths, one per contour in the path. Curves are adaptively flattened
// to `tolerance` path units before measurement. An empty path returns an empty array.
export function getPathContourLengths(path: Readonly<Path>, tolerance = 0.25): number[] {
  const contours = flattenPath(path, tolerance);
  const lengths: number[] = [];
  for (let ci = 0; ci < contours.length; ci++) {
    lengths.push(contourLength(contours[ci]));
  }
  return lengths;
}

function contourLength(contour: Readonly<number[]>): number {
  let len = 0;
  for (let i = 2; i < contour.length; i += 2) {
    const dx = contour[i] - contour[i - 2];
    const dy = contour[i + 1] - contour[i - 1];
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return len;
}
