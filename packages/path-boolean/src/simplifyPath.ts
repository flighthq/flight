import { flattenPath } from '@flighthq/path';
import type { Path, PathBooleanOptions } from '@flighthq/types';

import { resolvePathRegions } from './resolvePathRegions';

// Resolves a single path — possibly self-intersecting, self-overlapping, or holding several contours —
// into a clean, valid filled-region outline under its fill rule. This is the Clipper `SimplifyPaths` /
// Skia `Simplify` operation: the path is flattened to polygon contours at `options.tolerance`, then
// self-unioned through the active boolean kernel under `options.fillRule` (default `nonZero`). The two
// fill rules diverge on self-overlapping input — a region covered twice with the same winding fills solid
// under `nonZero` but punches an even-odd hole — which is why the fill rule travels with the operation.
// Returns a fresh polygon-outline `Path` (holes traced counter-wound to their outer ring); empty or fully
// degenerate input yields an empty path with no commands.
export function simplifyPath(path: Readonly<Path>, options?: Readonly<PathBooleanOptions>): Path {
  const fillRule = options?.fillRule ?? 'nonZero';
  const contours = flattenPath(path, options?.tolerance);
  return resolvePathRegions(contours, fillRule);
}
