// Generated from crates/flight-path-boolean/src/boolean_paths.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { flattenPath } from '@flighthq/path/contract';
import type { Path, PathWinding } from '@flighthq/path/contract';

import type { PathBooleanFillRule, PathBooleanKernelRaw, PathBooleanOperation } from './martinezKernel.ts';
import { writePathBooleanContours } from './writePathBooleanContours.ts';

/**
 * Options controlling the boolean path operations (TS `PathBooleanOptions`). `fillRule` is a
 * `PathWinding`, exactly TS (`fillRule?: PathWinding`): only even-odd and non-zero are public
 * options. The positive/negative rules of `PathBooleanFillRule` stay kernel/offset conventions.
 */
export interface PathBooleanOptions {
  fillRule?: PathWinding;
  tolerance?: number;
}

const DEFAULT_FLATTEN_TOLERANCE: number = 0.25;

/**
 * Generic boolean operation on two paths. Flattens both operands to polygon
 * contours, dispatches through the kernel, and writes the result into `out`.
 * Alias-safe: the subject and clip are fully captured (flattened) before any
 * write to `out`, so `out` may alias either input.
 */
export function booleanPaths(
  out: Path,
  pathBooleanKernel: Readonly<PathBooleanKernelRaw>,
  subject: Readonly<Path>,
  clip: Readonly<Path>,
  operation: PathBooleanOperation,
  options?: Readonly<PathBooleanOptions>,
): void {
  const fillRule = getPathBooleanFillRuleForWinding(options?.fillRule ?? 'nonZero');
  const tolerance = options?.tolerance ?? DEFAULT_FLATTEN_TOLERANCE;
  const subjectContours = flattenPath(subject, tolerance);
  const clipContours = flattenPath(clip, tolerance);
  const result = pathBooleanKernel.computePathBoolean(subjectContours, clipContours, operation, fillRule);
  writePathBooleanContours(out, result);
}

/**
 * Computes the set difference (subject minus clip) and writes the result into `out`.
 */
export function differencePaths(
  out: Path,
  pathBooleanKernel: Readonly<PathBooleanKernelRaw>,
  a: Readonly<Path>,
  b: Readonly<Path>,
  options?: Readonly<PathBooleanOptions>,
): void {
  booleanPaths(out, pathBooleanKernel, a, b, 'difference', options);
}

/**
 * The kernel fill rule for a public `PathWinding` option (TS passes the winding string straight
 * through, since `PathBooleanFillRule` includes `PathWinding`).
 */
export function getPathBooleanFillRuleForWinding(winding: PathWinding): PathBooleanFillRule {
  return (() => {
    const matchValue = winding;
    switch (matchValue) {
      case 'evenOdd':
        return 'evenOdd';
      case 'nonZero':
        return 'nonZero';
    }
  })();
}

/**
 * Computes the intersection of subject and clip and writes the result into `out`.
 */
export function intersectPaths(
  out: Path,
  pathBooleanKernel: Readonly<PathBooleanKernelRaw>,
  a: Readonly<Path>,
  b: Readonly<Path>,
  options?: Readonly<PathBooleanOptions>,
): void {
  booleanPaths(out, pathBooleanKernel, a, b, 'intersection', options);
}

/**
 * Computes the union of subject and clip and writes the result into `out`.
 */
export function unionPaths(
  out: Path,
  pathBooleanKernel: Readonly<PathBooleanKernelRaw>,
  a: Readonly<Path>,
  b: Readonly<Path>,
  options?: Readonly<PathBooleanOptions>,
): void {
  booleanPaths(out, pathBooleanKernel, a, b, 'union', options);
}

/**
 * Computes the symmetric difference (XOR) of subject and clip and writes the
 * result into `out`.
 */
export function xorPaths(
  out: Path,
  pathBooleanKernel: Readonly<PathBooleanKernelRaw>,
  a: Readonly<Path>,
  b: Readonly<Path>,
  options?: Readonly<PathBooleanOptions>,
): void {
  booleanPaths(out, pathBooleanKernel, a, b, 'xor', options);
}
