// Generated from crates/flight-path-boolean/src/explain_path_boolean.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { createPath, flattenPath } from '@flighthq/path/contract';
import type { Path } from '@flighthq/path/contract';

import type { PathBooleanKernelRaw } from './martinezKernel.ts';
import { offsetPath } from './offsetPath.ts';
import type { PathBooleanExplanation, PathBooleanOptions, PathOffsetOptions } from './pathBoolean.ts';
import { simplifyPath } from './simplifyPath.ts';

const DEFAULT_FLATTEN_TOLERANCE: number = 0.25;

/**
 * Checks whether `offsetPath` would produce a meaningful result for the given
 * path and delta. Returns `Some(explanation)` when the result is degenerate or
 * empty, `undefined` when the offset succeeds normally.
 */
export function explainOffsetPath(
  pathBooleanKernel: Readonly<PathBooleanKernelRaw>,
  path: Readonly<Path>,
  delta: number,
  options?: Readonly<PathOffsetOptions>,
): PathBooleanExplanation | undefined {
  if (!Number.isFinite(delta)) {
    return { operation: 'offset', reason: 'non-finite-delta' };
  }
  const tolerance = options?.tolerance ?? DEFAULT_FLATTEN_TOLERANCE;
  const contours = flattenPath(path, tolerance);
  if (contours.length === 0) {
    return { operation: 'offset', reason: 'empty-input' };
  }
  let result = createPath('nonZero');
  offsetPath(result, pathBooleanKernel, path, delta, options);
  if (result.commands.length === 0) {
    return { operation: 'offset', reason: 'collapsed-or-degenerate' };
  }
  return undefined;
}

/**
 * Checks whether `simplifyPath` would produce a meaningful result for the
 * given path. Returns `Some(explanation)` when the result is degenerate or
 * empty, `undefined` when simplification succeeds normally.
 */
export function explainSimplifyPath(
  pathBooleanKernel: Readonly<PathBooleanKernelRaw>,
  path: Readonly<Path>,
  options?: Readonly<PathBooleanOptions>,
): PathBooleanExplanation | undefined {
  const tolerance = options?.tolerance ?? DEFAULT_FLATTEN_TOLERANCE;
  const contours = flattenPath(path, tolerance);
  if (contours.length === 0) {
    return { operation: 'simplify', reason: 'empty-input' };
  }
  let result = createPath('nonZero');
  simplifyPath(result, pathBooleanKernel, path, options);
  if (result.commands.length === 0) {
    return { operation: 'simplify', reason: 'collapsed-or-degenerate' };
  }
  return undefined;
}
