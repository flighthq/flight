import { createPath, flattenPath } from '@flighthq/path/contract';
import type {
  PathBooleanKernel,
  Path,
  PathBooleanExplanation,
  PathBooleanOptions,
  PathOffsetOptions,
} from '@flighthq/types/contract';

import { offsetPath } from './offsetPath.ts';
import { simplifyPath } from './simplifyPath.ts';

export function explainOffsetPath(
  pathBooleanKernel: Readonly<PathBooleanKernel>,
  path: Readonly<Path>,
  delta: number,
  options?: Readonly<PathOffsetOptions>,
): PathBooleanExplanation | null {
  if (!Number.isFinite(delta)) return { operation: 'offset', reason: 'non-finite-delta' };
  if (flattenPath(path, options?.tolerance).length === 0) return { operation: 'offset', reason: 'empty-input' };
  const out = createPath('nonZero');
  offsetPath(out, pathBooleanKernel, path, delta, options);
  return out.commands.length === 0 ? { operation: 'offset', reason: 'collapsed-or-degenerate' } : null;
}

export function explainSimplifyPath(
  pathBooleanKernel: Readonly<PathBooleanKernel>,
  path: Readonly<Path>,
  options?: Readonly<PathBooleanOptions>,
): PathBooleanExplanation | null {
  if (flattenPath(path, options?.tolerance).length === 0) return { operation: 'simplify', reason: 'empty-input' };
  const out = createPath('nonZero');
  simplifyPath(out, pathBooleanKernel, path, options);
  return out.commands.length === 0 ? { operation: 'simplify', reason: 'collapsed-or-degenerate' } : null;
}
