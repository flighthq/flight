import { flattenPath } from '@flighthq/path/contract';
import type { PathBooleanKernel, Path, PathBooleanOptions } from '@flighthq/types/contract';

import { resolvePathRegions } from './resolvePathRegions';

export function simplifyPath(
  pathBooleanKernel: Readonly<PathBooleanKernel>,
  path: Readonly<Path>,
  options?: Readonly<PathBooleanOptions>,
  out?: Path,
): Path {
  const fillRule = options?.fillRule ?? 'nonZero';
  const contours = flattenPath(path, options?.tolerance);
  return resolvePathRegions(pathBooleanKernel, contours, fillRule, out);
}
