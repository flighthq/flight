import type { Path, PathMorphCreationExplanation, PathMorphCreationReason } from '@flighthq/types/contract';

export type { PathMorphCreationExplanation, PathMorphCreationReason } from '@flighthq/types/contract';

import {
  buildPathMorph,
  PathMorphIssueContourClosednessMismatch,
  PathMorphIssueContourCountMismatch,
  PathMorphIssueNone,
  PathMorphIssueWindingMismatch,
} from './pathMorphGeometry';

// Pure diagnostic twin of createPathMorph. Re-runs preparation, retains and mutates nothing, and
// returns detached data explaining whether the two paths have compatible morph topology. Kept in its
// own module so users importing only the morph constructor do not ship diagnostic reason strings.
export function explainPathMorphCreation(start: Readonly<Path>, end: Readonly<Path>): PathMorphCreationExplanation {
  const result = buildPathMorph(start, end);
  return {
    contour: result.contour,
    reason: getReason(result.issue),
    supported: result.issue === PathMorphIssueNone,
  };
}

function getReason(issue: number): PathMorphCreationReason {
  if (issue === PathMorphIssueWindingMismatch) return 'winding-mismatch';
  if (issue === PathMorphIssueContourCountMismatch) return 'contour-count-mismatch';
  if (issue === PathMorphIssueContourClosednessMismatch) return 'contour-closedness-mismatch';
  return 'ok';
}
