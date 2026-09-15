import { flattenPath } from '@flighthq/path/contract';
import type { HostPathBooleanProvider, Path, PathBooleanOperation, PathBooleanOptions } from '@flighthq/types/contract';

import { writePathBooleanContours } from './writePathBooleanContours';

export function booleanPaths(
  pathBoolean: Readonly<HostPathBooleanProvider>,
  subject: Readonly<Path>,
  clip: Readonly<Path>,
  operation: PathBooleanOperation,
  out?: Path,
  options?: Readonly<PathBooleanOptions>,
): Path {
  const fillRule = options?.fillRule ?? 'nonZero';
  const subjectContours = flattenPath(subject, options?.tolerance);
  const clipContours = flattenPath(clip, options?.tolerance);
  const result = pathBoolean.computePathBoolean(subjectContours, clipContours, operation, fillRule);
  return writePathBooleanContours(result, out);
}

export function differencePaths(
  pathBoolean: Readonly<HostPathBooleanProvider>,
  a: Readonly<Path>,
  b: Readonly<Path>,
  out?: Path,
  options?: Readonly<PathBooleanOptions>,
): Path {
  return booleanPaths(pathBoolean, a, b, 'difference', out, options);
}

export function intersectPaths(
  pathBoolean: Readonly<HostPathBooleanProvider>,
  a: Readonly<Path>,
  b: Readonly<Path>,
  out?: Path,
  options?: Readonly<PathBooleanOptions>,
): Path {
  return booleanPaths(pathBoolean, a, b, 'intersection', out, options);
}

export function unionPaths(
  pathBoolean: Readonly<HostPathBooleanProvider>,
  a: Readonly<Path>,
  b: Readonly<Path>,
  out?: Path,
  options?: Readonly<PathBooleanOptions>,
): Path {
  return booleanPaths(pathBoolean, a, b, 'union', out, options);
}

export function xorPaths(
  pathBoolean: Readonly<HostPathBooleanProvider>,
  a: Readonly<Path>,
  b: Readonly<Path>,
  out?: Path,
  options?: Readonly<PathBooleanOptions>,
): Path {
  return booleanPaths(pathBoolean, a, b, 'xor', out, options);
}
