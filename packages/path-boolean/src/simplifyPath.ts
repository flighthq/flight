// Generated from crates/flight-path-boolean/src/simplify_path.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { flattenPath } from '@flighthq/path/contract';
import type { Path } from '@flighthq/path/contract';

import { getPathBooleanFillRuleForWinding } from './booleanPaths.ts';
import type { PathBooleanKernelRaw } from './martinezKernel.ts';
import type { PathBooleanOptions } from './pathBoolean.ts';
import { resolvePathRegions } from './resolvePathRegions.ts';

const DEFAULT_FLATTEN_TOLERANCE: number = 0.25;

/**
 * Flattens the input path to polygon contours and resolves self-overlaps under the
 * given fill rule. The result is a clean, non-self-intersecting polygon outline. An
 * empty or degenerate input produces an empty output path.
 */
export function simplifyPath(
  out: Path,
  pathBooleanKernel: Readonly<PathBooleanKernelRaw>,
  path: Readonly<Path>,
  options?: Readonly<PathBooleanOptions>,
): void {
  const fillRule = getPathBooleanFillRuleForWinding(options?.fillRule ?? 'nonZero');
  const tolerance = options?.tolerance ?? DEFAULT_FLATTEN_TOLERANCE;
  const contours = flattenPath(path, tolerance);
  resolvePathRegions(out, pathBooleanKernel, contours, fillRule);
}
