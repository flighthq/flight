import { appendPathClose, appendPathLineTo, appendPathMoveTo, createPath, flattenPath } from '@flighthq/path';
import type { Path, PathBooleanContour, PathBooleanOptions } from '@flighthq/types';

import { getPathBooleanBackend } from './pathBooleanBackend';

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

  const path = out ?? createPath('nonZero');
  path.commands.length = 0;
  path.data.length = 0;
  path.winding = 'nonZero';
  for (const ring of result) {
    if (ring.length < 6) continue;
    appendPathMoveTo(path, ring[0], ring[1]);
    for (let i = 2; i < ring.length; i += 2) appendPathLineTo(path, ring[i], ring[i + 1]);
    appendPathClose(path);
  }
  return path;
}

const EMPTY_CONTOURS: readonly PathBooleanContour[] = [];
