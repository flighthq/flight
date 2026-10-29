// Generated from crates/flight-path-boolean/src/union_all_paths.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { flattenPath } from '@flighthq/path/contract';
import type { Path } from '@flighthq/path/contract';

import { getPathBooleanFillRuleForWinding } from './booleanPaths.ts';
import type { PathBooleanKernelRaw } from './martinezKernel.ts';
import type { PathBooleanOptions } from './pathBoolean.ts';
import { writePathBooleanContours } from './writePathBooleanContours.ts';

const DEFAULT_FLATTEN_TOLERANCE: number = 0.25;

/**
 * Gathers every contour from every path in the list and unions them all together
 * under the given fill rule. The result is a merged polygon outline written into
 * `out`.
 */
export function unionAllPaths(
  out: Path,
  pathBooleanKernel: Readonly<PathBooleanKernelRaw>,
  paths: Readonly<Readonly<Path>[]>,
  options?: Readonly<PathBooleanOptions>,
): void {
  const fillRule = getPathBooleanFillRuleForWinding(options?.fillRule ?? 'nonZero');
  const tolerance = options?.tolerance ?? DEFAULT_FLATTEN_TOLERANCE;
  let contours: number[][] = [] as never[];
  for (const path of paths) {
    const pathContours: number[][] = flattenPath(path, tolerance);
    for (let index = 0, count = pathContours.length; index < count; index++) {
      contours.push(pathContours[index]);
    }
  }
  if (contours.length === 0) {
    const empty: number[][] = [] as never[];
    writePathBooleanContours(out, empty);
    return;
  }
  const empty: number[][] = [] as never[];
  const result = pathBooleanKernel.computePathBoolean(contours, empty, 'union', fillRule);
  writePathBooleanContours(out, result);
}
