import { flattenPath } from '@flighthq/path/contract';
import type { HostPathBooleanProvider, Path, PathBooleanOptions } from '@flighthq/types/contract';

import { resolvePathRegions } from './resolvePathRegions';

export function simplifyPath(
  pathBoolean: Readonly<HostPathBooleanProvider>,
  path: Readonly<Path>,
  options?: Readonly<PathBooleanOptions>,
  out?: Path,
): Path {
  const fillRule = options?.fillRule ?? 'nonZero';
  const contours = flattenPath(path, options?.tolerance);
  return resolvePathRegions(pathBoolean, contours, fillRule, out);
}
