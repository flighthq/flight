import type {
  Path,
  StrokePathTessellationExplanation,
  StrokePathTessellationReason,
  StrokeStyle,
} from '@flighthq/types/contract';

export type { StrokePathTessellationExplanation, StrokePathTessellationReason } from '@flighthq/types/contract';

import {
  buildStrokePathGeometry,
  StrokePathTessellationIssueInvalidPath,
  StrokePathTessellationIssueInvalidStyle,
  StrokePathTessellationIssueNone,
  StrokePathTessellationIssueReversingJoin,
  StrokePathTessellationIssueSelfIntersectingCenterline,
  StrokePathTessellationIssueSelfIntersectingOutline,
} from './strokePathGeometry';

// Pure diagnostic twin of tessellateStrokePath: re-runs the shared validation, retains and mutates
// nothing, never throws, and returns detached plain data explaining a null mesh. Kept in its own module
// so production users importing only the tessellator do not ship reason strings.
export function explainStrokePathTessellation(
  path: Readonly<Path>,
  style: Readonly<StrokeStyle>,
  tolerance = 0.25,
): StrokePathTessellationExplanation {
  const geometry = buildStrokePathGeometry(path, style, tolerance);
  return {
    reason: getReason(geometry.issue),
    subpath: geometry.issueSubpath,
    supported: geometry.issue === StrokePathTessellationIssueNone,
  };
}

function getReason(issue: number): StrokePathTessellationReason {
  if (issue === StrokePathTessellationIssueInvalidStyle) return 'invalid-style';
  if (issue === StrokePathTessellationIssueInvalidPath) return 'invalid-path';
  if (issue === StrokePathTessellationIssueSelfIntersectingCenterline) return 'self-intersecting-centerline';
  if (issue === StrokePathTessellationIssueReversingJoin) return 'reversing-join';
  if (issue === StrokePathTessellationIssueSelfIntersectingOutline) return 'self-intersecting-outline';
  return 'ok';
}
