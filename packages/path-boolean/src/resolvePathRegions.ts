import type { PathBooleanKernel, Path, PathBooleanContour, PathBooleanFillRule } from '@flighthq/types/contract';

import { writePathBooleanContours } from './writePathBooleanContours.ts';

export function resolvePathRegions(
  out: Path,
  pathBooleanKernel: Readonly<PathBooleanKernel>,
  rings: readonly PathBooleanContour[],
  fillRule: PathBooleanFillRule,
): void {
  if (rings.length === 0) {
    writePathBooleanContours(out, EMPTY_CONTOURS);
    return;
  }
  const resolved = pathBooleanKernel.computePathBoolean(rings, EMPTY_CONTOURS, 'union', fillRule);
  writePathBooleanContours(out, resolved);
}

const EMPTY_CONTOURS: readonly PathBooleanContour[] = [];
