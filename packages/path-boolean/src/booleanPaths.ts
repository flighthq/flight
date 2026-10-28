import { flattenPath } from '@flighthq/path/contract';
import type { PathBooleanKernel, Path, PathBooleanOperation, PathBooleanOptions } from '@flighthq/types/contract';

import { writePathBooleanContours } from './writePathBooleanContours.ts';

export function booleanPaths(
  out: Path,
  pathBooleanKernel: Readonly<PathBooleanKernel>,
  subject: Readonly<Path>,
  clip: Readonly<Path>,
  operation: PathBooleanOperation,
  options?: Readonly<PathBooleanOptions>,
): void {
  const fillRule = options?.fillRule ?? 'nonZero';
  const subjectContours = flattenPath(subject, options?.tolerance);
  const clipContours = flattenPath(clip, options?.tolerance);
  const result = pathBooleanKernel.computePathBoolean(subjectContours, clipContours, operation, fillRule);
  writePathBooleanContours(out, result);
}

export function differencePaths(
  out: Path,
  pathBooleanKernel: Readonly<PathBooleanKernel>,
  a: Readonly<Path>,
  b: Readonly<Path>,
  options?: Readonly<PathBooleanOptions>,
): void {
  booleanPaths(out, pathBooleanKernel, a, b, 'difference', options);
}

export function intersectPaths(
  out: Path,
  pathBooleanKernel: Readonly<PathBooleanKernel>,
  a: Readonly<Path>,
  b: Readonly<Path>,
  options?: Readonly<PathBooleanOptions>,
): void {
  booleanPaths(out, pathBooleanKernel, a, b, 'intersection', options);
}

export function unionPaths(
  out: Path,
  pathBooleanKernel: Readonly<PathBooleanKernel>,
  a: Readonly<Path>,
  b: Readonly<Path>,
  options?: Readonly<PathBooleanOptions>,
): void {
  booleanPaths(out, pathBooleanKernel, a, b, 'union', options);
}

export function xorPaths(
  out: Path,
  pathBooleanKernel: Readonly<PathBooleanKernel>,
  a: Readonly<Path>,
  b: Readonly<Path>,
  options?: Readonly<PathBooleanOptions>,
): void {
  booleanPaths(out, pathBooleanKernel, a, b, 'xor', options);
}
