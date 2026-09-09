import { flattenPath } from '@flighthq/path/contract';
import type { Path, PathBooleanOperation, PathBooleanOptions } from '@flighthq/types/contract';

import { getPathBooleanBackend } from './pathBooleanBackend';
import { writePathBooleanContours } from './writePathBooleanContours';

// Runs an arbitrary boolean operation between two paths. `subject` and `clip` are flattened to polygon
// contours at the option tolerance, combined by the active kernel under the fill rule, and the result
// contours are written into `out` (a fresh non-zero-fill path when omitted). `subject` and `clip` are
// fully read before `out` is written, so `out` may safely alias either input.
export function booleanPaths(
  subject: Readonly<Path>,
  clip: Readonly<Path>,
  operation: PathBooleanOperation,
  out?: Path,
  options?: Readonly<PathBooleanOptions>,
): Path {
  const fillRule = options?.fillRule ?? 'nonZero';
  const subjectContours = flattenPath(subject, options?.tolerance);
  const clipContours = flattenPath(clip, options?.tolerance);
  const result = getPathBooleanBackend().computePathBoolean(subjectContours, clipContours, operation, fillRule);
  return writePathBooleanContours(result, out);
}

// Subject minus clip: the region inside `a` and outside `b`. The only non-symmetric operation.
export function differencePaths(
  a: Readonly<Path>,
  b: Readonly<Path>,
  out?: Path,
  options?: Readonly<PathBooleanOptions>,
): Path {
  return booleanPaths(a, b, 'difference', out, options);
}

// The overlap of `a` and `b`: the region inside both.
export function intersectPaths(
  a: Readonly<Path>,
  b: Readonly<Path>,
  out?: Path,
  options?: Readonly<PathBooleanOptions>,
): Path {
  return booleanPaths(a, b, 'intersection', out, options);
}

// The merge of `a` and `b`: the region inside either.
export function unionPaths(
  a: Readonly<Path>,
  b: Readonly<Path>,
  out?: Path,
  options?: Readonly<PathBooleanOptions>,
): Path {
  return booleanPaths(a, b, 'union', out, options);
}

// The symmetric difference of `a` and `b`: the region inside exactly one.
export function xorPaths(
  a: Readonly<Path>,
  b: Readonly<Path>,
  out?: Path,
  options?: Readonly<PathBooleanOptions>,
): Path {
  return booleanPaths(a, b, 'xor', out, options);
}
