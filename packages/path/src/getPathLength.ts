// Generated from crates/flight-path/src/get_path_length.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { flattenPath } from './flattenPath.ts';
import type { PathRaw } from './path.ts';

function contourLength(contour: Readonly<number[]>): number {
  let len: number = 0.0;
  let i = 2;
  while (i < contour.length) {
    const dx = contour[i] - contour[i - 2];
    const dy = contour[i + 1] - contour[i - 1];
    len += Math.sqrt(dx * dx + dy * dy);
    i += 2;
  }
  return len;
}

/**
 * Returns the total arc length of `path` by summing the Euclidean lengths of all flattened segments.
 */
export function getPathLength(path: Readonly<PathRaw>, tolerance?: number): number {
  tolerance = tolerance ?? 0.25;
  const contours = flattenPath(path, tolerance);
  let total: number = 0.0;
  for (let ci = 0; ci < contours.length; ci += 1) {
    total += contourLength(contours[ci]);
  }
  return total;
}
