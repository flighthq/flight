import { flattenPath } from '@flighthq/path/contract';
import type { PathBooleanKernel, Path, PathBooleanContour, PathBooleanOptions } from '@flighthq/types/contract';

import { writePathBooleanContours } from './writePathBooleanContours.ts';

export function unionAllPaths(
  out: Path,
  pathBooleanKernel: Readonly<PathBooleanKernel>,
  paths: readonly Readonly<Path>[],
  options?: Readonly<PathBooleanOptions>,
): void {
  const fillRule = options?.fillRule ?? 'nonZero';
  const contours: PathBooleanContour[] = [];
  for (const path of paths) {
    for (const contour of flattenPath(path, options?.tolerance)) contours.push(contour);
  }
  const result =
    contours.length === 0
      ? EMPTY_CONTOURS
      : pathBooleanKernel.computePathBoolean(contours, EMPTY_CONTOURS, 'union', fillRule);

  writePathBooleanContours(out, result);
}

const EMPTY_CONTOURS: readonly PathBooleanContour[] = [];
