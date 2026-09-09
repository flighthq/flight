import { flattenPath } from '@flighthq/path/contract';
import type { Path, PathBooleanContour, PathBooleanOptions } from '@flighthq/types/contract';

import { getPathBooleanBackend } from './pathBooleanBackend';
import { writePathBooleanContours } from './writePathBooleanContours';

// N-way union of a list of paths into one clean filled-region outline. Every path is flattened to polygon
// contours at the option tolerance and the whole set is folded together in a single union pass through the
// active kernel under the fill rule (default `nonZero`), so overlaps merge and holes are preserved exactly
// as a repeated binary `unionPaths` fold would produce, without the intermediate allocations. The result
// contours are written into `out` (a fresh `nonZero` path when omitted). An empty list yields an empty
// path; a single path yields its own self-overlap-resolved region, matching `simplifyPath`. Every input is
// fully read before `out` is written, so `out` may safely alias any path in the list.
export function unionAllPaths(
  paths: readonly Readonly<Path>[],
  out?: Path,
  options?: Readonly<PathBooleanOptions>,
): Path {
  const fillRule = options?.fillRule ?? 'nonZero';
  const contours: PathBooleanContour[] = [];
  for (const path of paths) {
    for (const contour of flattenPath(path, options?.tolerance)) contours.push(contour);
  }
  const result =
    contours.length === 0
      ? EMPTY_CONTOURS
      : getPathBooleanBackend().computePathBoolean(contours, EMPTY_CONTOURS, 'union', fillRule);

  return writePathBooleanContours(result, out);
}

const EMPTY_CONTOURS: readonly PathBooleanContour[] = [];
