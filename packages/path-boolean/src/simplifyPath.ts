import { flattenPath } from '@flighthq/path/contract';
import type { PathBooleanKernel, Path, PathBooleanOptions } from '@flighthq/types/contract';

import { resolvePathRegions } from './resolvePathRegions.ts';

export function simplifyPath(
  out: Path,
  pathBooleanKernel: Readonly<PathBooleanKernel>,
  path: Readonly<Path>,
  options?: Readonly<PathBooleanOptions>,
): void {
  const fillRule = options?.fillRule ?? 'nonZero';
  const contours = flattenPath(path, options?.tolerance);
  resolvePathRegions(out, pathBooleanKernel, contours, fillRule);
}
