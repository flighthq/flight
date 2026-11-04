import type { PathMorphCreationExplanation, PathRaw } from './path.ts';
import { buildPathMorph } from './pathMorphGeometry.ts';

/**
 * Pure diagnostic twin of create_path_morph. Re-runs preparation, retains and mutates nothing,
 * and returns detached data explaining whether the two paths have compatible morph topology.
 */
export function explainPathMorphCreation(
  start: Readonly<PathRaw>,
  end: Readonly<PathRaw>,
): PathMorphCreationExplanation {
  const result = buildPathMorph(start, end);
  return { supported: result.issue === 'ok', reason: result.issue, contour: result.contour ?? null };
}
