// Generated from crates/flight-path/src/lib.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export { cleanPath } from './cleanPath.ts';
export { containsPathPoint } from './containsPathPoint.ts';
export { clonePath, copyPath } from './copyPath.ts';
export { dashPath } from './dashPath.ts';
export { decimatePath } from './decimatePath.ts';
export { explainPathMorphCreation } from './explainPathMorphCreation.ts';
export { explainStrokePathTessellation } from './explainStrokePathTessellation.ts';
export { fitPathCurves } from './fitPathCurves.ts';
export { flattenPath } from './flattenPath.ts';
export { forEachPathSegment } from './forEachPathSegment.ts';
export { getPathBounds } from './getPathBounds.ts';
export { getPathContourLengths } from './getPathContourLengths.ts';
export { getPathCurvatureAtDistance } from './getPathCurvatureAtDistance.ts';
export { getPathLength } from './getPathLength.ts';
export { getPathNearestPoint } from './getPathNearestPoint.ts';
export {
  getPathPointAtDistance,
  getPathPositionAtDistance,
  getPathTangentAtDistance,
} from './getPathPointAtDistance.ts';
export {
  getCubicBezierCurvature,
  getCubicBezierPoint,
  getCubicBezierTangent,
  getPathSegmentCurvatureAtParameter,
  getPathSegmentPointAtParameter,
  getPathSegmentTangentAtParameter,
  getQuadraticBezierCurvature,
  getQuadraticBezierPoint,
  getQuadraticBezierTangent,
} from './getPathSegmentAtParameter.ts';
export { getPathContourOrientation, getPathSignedArea } from './getPathSignedArea.ts';
export type { ContourOrientation } from './getPathSignedArea.ts';
export {
  PathCommand,
  appendPathArc,
  appendPathCircle,
  appendPathClose,
  appendPathCubicCurveTo,
  appendPathEllipse,
  appendPathEllipticalArcTo,
  appendPathLineTo,
  appendPathMoveTo,
  appendPathPolygon,
  appendPathPolyline,
  appendPathQuadraticCurveTo,
  appendPathRectangle,
  appendPathRoundedRectangle,
  appendPathRoundedRectangleWithCornerRadii,
  appendPathTangentArcTo,
  createPath,
  getPathLastPoint,
  getPathMorphCreationReasonString,
  getPathWindingString,
  getStrokeCapString,
  getStrokeJoinString,
  getStrokePathTessellationReasonString,
  initializePath,
  parsePathMorphCreationReason,
  parsePathWinding,
  parseStrokeCap,
  parseStrokeJoin,
  parseStrokePathTessellationReason,
} from './path.ts';
export type {
  PathMesh,
  PathMeshTyped,
  PathMorphCreationExplanation,
  PathMorphCreationReason,
  PathMorphRaw,
  PathRaw,
  PathSegment,
  PathWinding,
  StrokeCap,
  StrokeJoin,
  StrokePathTessellationExplanation,
  StrokePathTessellationReason,
  StrokeStyle,
} from './path.ts';
export type { Path, PathMorph } from './pathCompat.ts';
export { acquirePathMesh, acquirePathMeshTyped, releasePathMesh, releasePathMeshTyped } from './pathMeshPool.ts';
export { createPathMorph, samplePathMorph } from './pathMorph.ts';
export {
  PathMorphIssueContourClosednessMismatch,
  PathMorphIssueContourCountMismatch,
  PathMorphIssueContourOrientationMismatch,
  PathMorphIssueNone,
  PathMorphIssueWindingMismatch,
  buildPathMorph,
  initializePathMorph,
} from './pathMorphGeometry.ts';
export type { PathMorphBuildResult } from './pathMorphGeometry.ts';
export { reversePath } from './reversePath.ts';
export { strokePath } from './strokePath.ts';
export {
  StrokePathTessellationIssueInvalidPath,
  StrokePathTessellationIssueInvalidStyle,
  StrokePathTessellationIssueNone,
  StrokePathTessellationIssueReversingJoin,
  StrokePathTessellationIssueSelfIntersectingCenterline,
  StrokePathTessellationIssueSelfIntersectingOutline,
  buildStrokePathGeometry,
} from './strokePathGeometry.ts';
export type { StrokePathGeometry, StrokePathPieceGeometry } from './strokePathGeometry.ts';
export { tessellatePath, tessellatePathInto } from './tessellatePath.ts';
export { tessellatePathTyped, tessellatePathTypedInto } from './tessellatePathTyped.ts';
export { tessellateStrokePath } from './tessellateStrokePath.ts';
export { transformPath, translatePath } from './transformPath.ts';
