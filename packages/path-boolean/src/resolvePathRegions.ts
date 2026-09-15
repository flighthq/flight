import type { HostPathBooleanProvider, Path, PathBooleanContour, PathBooleanFillRule } from '@flighthq/types/contract';

import { writePathBooleanContours } from './writePathBooleanContours';

export function resolvePathRegions(
  pathBoolean: Readonly<HostPathBooleanProvider>,
  rings: readonly PathBooleanContour[],
  fillRule: PathBooleanFillRule,
  out?: Path,
): Path {
  if (rings.length === 0) return writePathBooleanContours(EMPTY_CONTOURS, out);
  const resolved = pathBoolean.computePathBoolean(rings, EMPTY_CONTOURS, 'union', fillRule);
  return writePathBooleanContours(resolved, out);
}

const EMPTY_CONTOURS: readonly PathBooleanContour[] = [];
