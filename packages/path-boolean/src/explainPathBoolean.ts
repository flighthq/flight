import { flattenPath } from '@flighthq/path/contract';
import type { Path, PathBooleanExplanation, PathBooleanOptions, PathOffsetOptions } from '@flighthq/types/contract';

import { offsetPath } from './offsetPath';
import { simplifyPath } from './simplifyPath';

export function explainOffsetPath(
  path: Readonly<Path>,
  delta: number,
  options?: Readonly<PathOffsetOptions>,
): PathBooleanExplanation | null {
  if (!Number.isFinite(delta)) return { operation: 'offset', reason: 'non-finite-delta' };
  if (flattenPath(path, options?.tolerance).length === 0) return { operation: 'offset', reason: 'empty-input' };
  return offsetPath(path, delta, options).commands.length === 0
    ? { operation: 'offset', reason: 'collapsed-or-degenerate' }
    : null;
}

export function explainSimplifyPath(
  path: Readonly<Path>,
  options?: Readonly<PathBooleanOptions>,
): PathBooleanExplanation | null {
  if (flattenPath(path, options?.tolerance).length === 0) return { operation: 'simplify', reason: 'empty-input' };
  return simplifyPath(path, options).commands.length === 0
    ? { operation: 'simplify', reason: 'collapsed-or-degenerate' }
    : null;
}
