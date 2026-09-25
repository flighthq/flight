import { flattenPath } from '@flighthq/path/contract';
import type { PathBooleanKernel, Path, PathBooleanOperation, PathBooleanOptions } from '@flighthq/types/contract';

import { writePathBooleanContours } from './writePathBooleanContours.ts';

export function booleanPaths(
  pathBooleanKernel: Readonly<PathBooleanKernel>,
  subject: Readonly<Path>,
  clip: Readonly<Path>,
  operation: PathBooleanOperation,
  out?: Path,
  options?: Readonly<PathBooleanOptions>,
): Path {
  const fillRule = options?.fillRule ?? 'nonZero';
  const subjectContours = flattenPath(subject, options?.tolerance);
  const clipContours = flattenPath(clip, options?.tolerance);
  const result = pathBooleanKernel.computePathBoolean(subjectContours, clipContours, operation, fillRule);
  return writePathBooleanContours(result, out);
}

export function differencePaths(
  pathBooleanKernel: Readonly<PathBooleanKernel>,
  a: Readonly<Path>,
  b: Readonly<Path>,
  out?: Path,
  options?: Readonly<PathBooleanOptions>,
): Path {
  return booleanPaths(pathBooleanKernel, a, b, 'difference', out, options);
}

export function intersectPaths(
  pathBooleanKernel: Readonly<PathBooleanKernel>,
  a: Readonly<Path>,
  b: Readonly<Path>,
  out?: Path,
  options?: Readonly<PathBooleanOptions>,
): Path {
  return booleanPaths(pathBooleanKernel, a, b, 'intersection', out, options);
}

export function unionPaths(
  pathBooleanKernel: Readonly<PathBooleanKernel>,
  a: Readonly<Path>,
  b: Readonly<Path>,
  out?: Path,
  options?: Readonly<PathBooleanOptions>,
): Path {
  return booleanPaths(pathBooleanKernel, a, b, 'union', out, options);
}

export function xorPaths(
  pathBooleanKernel: Readonly<PathBooleanKernel>,
  a: Readonly<Path>,
  b: Readonly<Path>,
  out?: Path,
  options?: Readonly<PathBooleanOptions>,
): Path {
  return booleanPaths(pathBooleanKernel, a, b, 'xor', out, options);
}
