import type { Path, StrokeStyle } from '@flighthq/types/contract';

import { flattenPath } from './flattenPath';

export const StrokePathTessellationIssueNone = 0;
export const StrokePathTessellationIssueInvalidStyle = 1;
export const StrokePathTessellationIssueInvalidPath = 2;
export const StrokePathTessellationIssueSelfIntersectingCenterline = 3;
export const StrokePathTessellationIssueReversingJoin = 4;
export const StrokePathTessellationIssueSelfIntersectingOutline = 5;

type StrokePathTessellationIssue = 0 | 1 | 2 | 3 | 4 | 5;

interface StrokePathPieceGeometry {
  closed: boolean;
  endCap: number[];
  left: number[];
  right: number[];
  startCap: number[];
}

interface StrokePathGeometry {
  issue: StrokePathTessellationIssue;
  issueSubpath: number | null;
  pieces: StrokePathPieceGeometry[];
}

interface StrokeSubpath {
  closed: boolean;
  points: number[];
  sourceIndex: number;
}

interface SegmentFrame {
  nx: number;
  ny: number;
  tx: number;
  ty: number;
}

// Shared stroke kernel used by both strokePath (outline emission) and tessellateStrokePath (direct
// non-overlapping triangles). Curves flatten once here, dashes split once here, and both consumers see
// the same offset/join/cap samples. The numeric issue code carries no diagnostic prose into core bundles;
// explainStrokePathTessellation maps it to plain-data reasons in its separately importable module.
export function buildStrokePathGeometry(
  path: Readonly<Path>,
  style: Readonly<StrokeStyle>,
  tolerance: number,
): StrokePathGeometry {
  const width = style.width ?? 1;
  const dashOffset = style.dashOffset ?? 0;
  const miterLimit = style.miterLimit ?? 4;
  if (
    !Number.isFinite(width) ||
    width <= 0 ||
    !Number.isFinite(tolerance) ||
    tolerance <= 0 ||
    !Number.isFinite(dashOffset) ||
    !Number.isFinite(miterLimit) ||
    miterLimit < 0
  ) {
    return { issue: StrokePathTessellationIssueInvalidStyle, issueSubpath: null, pieces: [] };
  }
  const dash = style.dash ?? EMPTY_DASH;
  for (let i = 0; i < dash.length; i++) {
    if (!Number.isFinite(dash[i]) || dash[i] < 0) {
      return { issue: StrokePathTessellationIssueInvalidStyle, issueSubpath: null, pieces: [] };
    }
  }

  const source = createStrokeSubpaths(path, tolerance);
  for (let i = 0; i < source.length; i++) {
    if (!areFinitePoints(source[i].points)) {
      return { issue: StrokePathTessellationIssueInvalidPath, issueSubpath: source[i].sourceIndex, pieces: [] };
    }
  }
  const centerlineIntersection = findCenterlineIntersection(source);
  let issue: StrokePathTessellationIssue =
    centerlineIntersection === null
      ? StrokePathTessellationIssueNone
      : StrokePathTessellationIssueSelfIntersectingCenterline;
  let issueSubpath = centerlineIntersection;

  const pieces: StrokePathPieceGeometry[] = [];
  const halfWidth = width / 2;
  const cap = style.cap ?? 'butt';
  const join = style.join ?? 'miter';
  for (let i = 0; i < source.length; i++) {
    const subpath = source[i];
    const spans = dash.length > 0 ? applyDash(subpath, dash, dashOffset) : [subpath];
    for (let j = 0; j < spans.length; j++) {
      const built = buildStrokePiece(spans[j], halfWidth, join, cap, miterLimit, tolerance);
      if (built.piece !== null) {
        pieces.push(built.piece);
        if (issue === StrokePathTessellationIssueNone && hasInvalidOutline(built.piece)) {
          issue = StrokePathTessellationIssueSelfIntersectingOutline;
          issueSubpath = subpath.sourceIndex;
        }
      }
      if (issue === StrokePathTessellationIssueNone && built.issue !== StrokePathTessellationIssueNone) {
        issue = built.issue;
        issueSubpath = subpath.sourceIndex;
      }
    }
  }

  return { issue, issueSubpath, pieces };
}

function createStrokeSubpaths(path: Readonly<Path>, tolerance: number): StrokeSubpath[] {
  const contours = flattenPath(path, tolerance);
  const result: StrokeSubpath[] = [];
  for (let i = 0; i < contours.length; i++) {
    const points = removeConsecutiveDuplicates(contours[i]);
    if (points.length < 4) continue;
    const last = points.length - 2;
    const closed =
      points.length >= 8 &&
      approximatelyEqual(points[0], points[last]) &&
      approximatelyEqual(points[1], points[last + 1]);
    if (closed) {
      points[last] = points[0];
      points[last + 1] = points[1];
    }
    result.push({ closed, points, sourceIndex: i });
  }
  return result;
}

function buildStrokePiece(
  subpath: StrokeSubpath,
  halfWidth: number,
  join: 'bevel' | 'miter' | 'round',
  cap: 'butt' | 'round' | 'square',
  miterLimit: number,
  tolerance: number,
): { issue: StrokePathTessellationIssue; piece: StrokePathPieceGeometry | null } {
  const points = subpath.points;
  const pointCount = points.length >> 1;
  const segmentCount = pointCount - 1;
  if (segmentCount < 1) return { issue: StrokePathTessellationIssueNone, piece: null };

  const frames: SegmentFrame[] = [];
  for (let i = 0; i < segmentCount; i++) {
    const x0 = points[i * 2];
    const y0 = points[i * 2 + 1];
    const dx = points[(i + 1) * 2] - x0;
    const dy = points[(i + 1) * 2 + 1] - y0;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length <= GEOMETRY_EPSILON) continue;
    const tx = dx / length;
    const ty = dy / length;
    frames.push({ nx: -ty, ny: tx, tx, ty });
  }
  if (frames.length !== segmentCount) return { issue: StrokePathTessellationIssueInvalidPath, piece: null };

  const piece: StrokePathPieceGeometry = { closed: subpath.closed, endCap: [], left: [], right: [], startCap: [] };
  if (!subpath.closed) {
    appendEndpointSection(piece, points[0], points[1], frames[0], halfWidth, cap, true, tolerance);
    for (let i = 1; i < pointCount - 1; i++) {
      const issue = appendJoinSections(
        piece,
        points[i * 2],
        points[i * 2 + 1],
        frames[i - 1],
        frames[i],
        halfWidth,
        join,
        miterLimit,
        tolerance,
      );
      if (issue !== StrokePathTessellationIssueNone) return { issue, piece };
    }
    appendEndpointSection(
      piece,
      points[(pointCount - 1) * 2],
      points[(pointCount - 1) * 2 + 1],
      frames[frames.length - 1],
      halfWidth,
      cap,
      false,
      tolerance,
    );
  } else {
    const uniquePointCount = pointCount - 1;
    for (let i = 0; i < uniquePointCount; i++) {
      const issue = appendJoinSections(
        piece,
        points[i * 2],
        points[i * 2 + 1],
        frames[(i + frames.length - 1) % frames.length],
        frames[i],
        halfWidth,
        join,
        miterLimit,
        tolerance,
      );
      if (issue !== StrokePathTessellationIssueNone) return { issue, piece };
    }
  }
  return { issue: StrokePathTessellationIssueNone, piece };
}

function appendEndpointSection(
  piece: StrokePathPieceGeometry,
  px: number,
  py: number,
  frame: SegmentFrame,
  halfWidth: number,
  cap: 'butt' | 'round' | 'square',
  start: boolean,
  tolerance: number,
): void {
  const extension = cap === 'square' ? (start ? -halfWidth : halfWidth) : 0;
  const cx = px + frame.tx * extension;
  const cy = py + frame.ty * extension;
  appendSection(
    piece,
    cx + frame.nx * halfWidth,
    cy + frame.ny * halfWidth,
    cx - frame.nx * halfWidth,
    cy - frame.ny * halfWidth,
  );
  if (cap !== 'round') return;
  if (start) {
    piece.startCap = createArcInteriorPoints(px, py, halfWidth, Math.atan2(-frame.ny, -frame.nx), -Math.PI, tolerance);
  } else {
    piece.endCap = createArcInteriorPoints(px, py, halfWidth, Math.atan2(frame.ny, frame.nx), -Math.PI, tolerance);
  }
}

function appendJoinSections(
  piece: StrokePathPieceGeometry,
  px: number,
  py: number,
  previous: SegmentFrame,
  next: SegmentFrame,
  halfWidth: number,
  join: 'bevel' | 'miter' | 'round',
  miterLimit: number,
  tolerance: number,
): StrokePathTessellationIssue {
  const turn = cross(previous.tx, previous.ty, next.tx, next.ty);
  const direction = previous.tx * next.tx + previous.ty * next.ty;
  if (Math.abs(turn) <= GEOMETRY_EPSILON) {
    if (direction < 0) return StrokePathTessellationIssueReversingJoin;
    appendSection(
      piece,
      px + next.nx * halfWidth,
      py + next.ny * halfWidth,
      px - next.nx * halfWidth,
      py - next.ny * halfWidth,
    );
    return StrokePathTessellationIssueNone;
  }

  const left0X = px + previous.nx * halfWidth;
  const left0Y = py + previous.ny * halfWidth;
  const left1X = px + next.nx * halfWidth;
  const left1Y = py + next.ny * halfWidth;
  const right0X = px - previous.nx * halfWidth;
  const right0Y = py - previous.ny * halfWidth;
  const right1X = px - next.nx * halfWidth;
  const right1Y = py - next.ny * halfWidth;
  const leftIntersection = intersectLines(left0X, left0Y, previous.tx, previous.ty, left1X, left1Y, next.tx, next.ty);
  const rightIntersection = intersectLines(
    right0X,
    right0Y,
    previous.tx,
    previous.ty,
    right1X,
    right1Y,
    next.tx,
    next.ty,
  );
  if (leftIntersection === null || rightIntersection === null) return StrokePathTessellationIssueReversingJoin;

  const outerIntersection = turn > 0 ? rightIntersection : leftIntersection;
  const outerDistance = Math.hypot(outerIntersection[0] - px, outerIntersection[1] - py);
  if (join === 'miter' && Number.isFinite(miterLimit) && outerDistance <= halfWidth * Math.max(0, miterLimit)) {
    appendSection(piece, leftIntersection[0], leftIntersection[1], rightIntersection[0], rightIntersection[1]);
    return StrokePathTessellationIssueNone;
  }

  const inner = turn > 0 ? leftIntersection : rightIntersection;
  if (join === 'round') {
    const outer0X = turn > 0 ? right0X : left0X;
    const outer0Y = turn > 0 ? right0Y : left0Y;
    const outerStartAngle = Math.atan2(outer0Y - py, outer0X - px);
    const sweep = signedJoinSweep(previous, next, turn);
    const outer = createArcPoints(px, py, halfWidth, outerStartAngle, sweep, tolerance);
    for (let i = 0; i < outer.length; i += 2) {
      if (turn > 0) appendSection(piece, inner[0], inner[1], outer[i], outer[i + 1]);
      else appendSection(piece, outer[i], outer[i + 1], inner[0], inner[1]);
    }
  } else if (turn > 0) {
    appendSection(piece, inner[0], inner[1], right0X, right0Y);
    appendSection(piece, inner[0], inner[1], right1X, right1Y);
  } else {
    appendSection(piece, left0X, left0Y, inner[0], inner[1]);
    appendSection(piece, left1X, left1Y, inner[0], inner[1]);
  }
  return StrokePathTessellationIssueNone;
}

function signedJoinSweep(previous: SegmentFrame, next: SegmentFrame, turn: number): number {
  const start = turn > 0 ? Math.atan2(-previous.ny, -previous.nx) : Math.atan2(previous.ny, previous.nx);
  const end = turn > 0 ? Math.atan2(-next.ny, -next.nx) : Math.atan2(next.ny, next.nx);
  let sweep = end - start;
  if (turn > 0 && sweep < 0) sweep += Math.PI * 2;
  if (turn < 0 && sweep > 0) sweep -= Math.PI * 2;
  return sweep;
}

function appendSection(piece: StrokePathPieceGeometry, lx: number, ly: number, rx: number, ry: number): void {
  piece.left.push(lx, ly);
  piece.right.push(rx, ry);
}

function createArcInteriorPoints(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  sweep: number,
  tolerance: number,
): number[] {
  const points = createArcPoints(cx, cy, radius, startAngle, sweep, tolerance);
  return points.slice(2, -2);
}

function createArcPoints(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  sweep: number,
  tolerance: number,
): number[] {
  const ratio = Math.max(-1, Math.min(1, 1 - tolerance / radius));
  const maxStep = Math.max(Math.PI / 32, 2 * Math.acos(ratio));
  const steps = Math.max(1, Math.ceil(Math.abs(sweep) / maxStep));
  const points: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = startAngle + (sweep * i) / steps;
    points.push(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
  }
  return points;
}

function intersectLines(
  ax: number,
  ay: number,
  adx: number,
  ady: number,
  bx: number,
  by: number,
  bdx: number,
  bdy: number,
): [number, number] | null {
  const denominator = cross(adx, ady, bdx, bdy);
  if (Math.abs(denominator) <= GEOMETRY_EPSILON) return null;
  const scale = cross(bx - ax, by - ay, bdx, bdy) / denominator;
  return [ax + adx * scale, ay + ady * scale];
}

function applyDash(subpath: StrokeSubpath, dash: readonly number[], dashOffset: number): StrokeSubpath[] {
  const pattern = dash.length % 2 === 0 ? dash : dash.concat(dash);
  const total = pattern.reduce((sum, value) => sum + value, 0);
  if (total <= GEOMETRY_EPSILON) return [subpath];

  const offset = ((dashOffset % total) + total) % total;
  let patternIndex = 0;
  let consumedOffset = offset;
  while (pattern[patternIndex] <= GEOMETRY_EPSILON || consumedOffset >= pattern[patternIndex]) {
    if (pattern[patternIndex] > GEOMETRY_EPSILON) consumedOffset -= pattern[patternIndex];
    patternIndex = (patternIndex + 1) % pattern.length;
  }
  let remaining = pattern[patternIndex] - consumedOffset;
  let on = patternIndex % 2 === 0;
  const result: StrokeSubpath[] = [];
  let current: number[] | null = null;
  const points = subpath.points;
  for (let segment = 0; segment < (points.length >> 1) - 1; segment++) {
    const x0 = points[segment * 2];
    const y0 = points[segment * 2 + 1];
    const x1 = points[(segment + 1) * 2];
    const y1 = points[(segment + 1) * 2 + 1];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const length = Math.hypot(dx, dy);
    let distance = 0;
    while (distance < length - GEOMETRY_EPSILON) {
      while (remaining <= GEOMETRY_EPSILON) {
        patternIndex = (patternIndex + 1) % pattern.length;
        remaining = pattern[patternIndex];
        on = patternIndex % 2 === 0;
        if (!on && current !== null) {
          pushDash(result, current, subpath.sourceIndex);
          current = null;
        }
      }
      const step = Math.min(remaining, length - distance);
      const startX = x0 + (dx * distance) / length;
      const startY = y0 + (dy * distance) / length;
      distance += step;
      const endX = x0 + (dx * distance) / length;
      const endY = y0 + (dy * distance) / length;
      if (on) {
        current ??= [startX, startY];
        current.push(endX, endY);
      } else if (current !== null) {
        pushDash(result, current, subpath.sourceIndex);
        current = null;
      }
      remaining -= step;
    }
  }
  if (current !== null) pushDash(result, current, subpath.sourceIndex);
  return result;
}

function pushDash(result: StrokeSubpath[], points: number[], sourceIndex: number): void {
  if (points.length >= 4) result.push({ closed: false, points, sourceIndex });
}

function findCenterlineIntersection(subpaths: readonly StrokeSubpath[]): number | null {
  for (let i = 0; i < subpaths.length; i++) {
    if (hasPolylineSelfIntersection(subpaths[i].points, subpaths[i].closed)) return subpaths[i].sourceIndex;
    for (let j = 0; j < i; j++) {
      if (doPolylinesIntersect(subpaths[i].points, subpaths[i].closed, subpaths[j].points, subpaths[j].closed)) {
        return subpaths[i].sourceIndex;
      }
    }
  }
  return null;
}

function hasInvalidOutline(piece: StrokePathPieceGeometry): boolean {
  const left = removeConsecutiveDuplicates(piece.left);
  const right = removeConsecutiveDuplicates(piece.right);
  if (piece.closed) {
    return (
      hasPolylineSelfIntersection(left, true) ||
      hasPolylineSelfIntersection(right, true) ||
      doPolylinesIntersect(left, true, right, true)
    );
  }
  const outline = left.concat(piece.endCap, reversePoints(right), piece.startCap);
  return hasPolylineSelfIntersection(removeConsecutiveDuplicates(outline), true);
}

function hasPolylineSelfIntersection(points: readonly number[], closed: boolean): boolean {
  const count = getPolylinePointCount(points, closed);
  const segmentCount = closed ? count : count - 1;
  for (let i = 0; i < segmentCount; i++) {
    const iNext = (i + 1) % count;
    if (samePoint(points, i, iNext)) continue;
    for (let j = i + 1; j < segmentCount; j++) {
      const jNext = (j + 1) % count;
      if (samePoint(points, j, jNext) || segmentsAreAdjacent(i, j, segmentCount, closed)) continue;
      if (segmentsIntersect(points, i, iNext, points, j, jNext)) return true;
    }
  }
  return false;
}

function doPolylinesIntersect(a: readonly number[], aClosed: boolean, b: readonly number[], bClosed: boolean): boolean {
  const aCount = getPolylinePointCount(a, aClosed);
  const bCount = getPolylinePointCount(b, bClosed);
  const aSegments = aClosed ? aCount : aCount - 1;
  const bSegments = bClosed ? bCount : bCount - 1;
  for (let i = 0; i < aSegments; i++) {
    const iNext = (i + 1) % aCount;
    if (samePoint(a, i, iNext)) continue;
    for (let j = 0; j < bSegments; j++) {
      const jNext = (j + 1) % bCount;
      if (samePoint(b, j, jNext)) continue;
      if (segmentsIntersect(a, i, iNext, b, j, jNext)) return true;
    }
  }
  return false;
}

function getPolylinePointCount(points: readonly number[], closed: boolean): number {
  const count = points.length >> 1;
  return closed && count > 1 && samePoint(points, 0, count - 1) ? count - 1 : count;
}

function segmentsAreAdjacent(a: number, b: number, segmentCount: number, closed: boolean): boolean {
  if (b === a + 1) return true;
  return closed && a === 0 && b === segmentCount - 1;
}

function segmentsIntersect(
  a: readonly number[],
  ai: number,
  aj: number,
  b: readonly number[],
  bi: number,
  bj: number,
): boolean {
  const ax = a[ai * 2];
  const ay = a[ai * 2 + 1];
  const bx = a[aj * 2];
  const by = a[aj * 2 + 1];
  const cx = b[bi * 2];
  const cy = b[bi * 2 + 1];
  const dx = b[bj * 2];
  const dy = b[bj * 2 + 1];
  const abC = cross(bx - ax, by - ay, cx - ax, cy - ay);
  const abD = cross(bx - ax, by - ay, dx - ax, dy - ay);
  const cdA = cross(dx - cx, dy - cy, ax - cx, ay - cy);
  const cdB = cross(dx - cx, dy - cy, bx - cx, by - cy);
  if (
    ((abC > GEOMETRY_EPSILON && abD < -GEOMETRY_EPSILON) || (abC < -GEOMETRY_EPSILON && abD > GEOMETRY_EPSILON)) &&
    ((cdA > GEOMETRY_EPSILON && cdB < -GEOMETRY_EPSILON) || (cdA < -GEOMETRY_EPSILON && cdB > GEOMETRY_EPSILON))
  ) {
    return true;
  }
  if (Math.abs(abC) <= GEOMETRY_EPSILON && pointOnSegment(cx, cy, ax, ay, bx, by)) return true;
  if (Math.abs(abD) <= GEOMETRY_EPSILON && pointOnSegment(dx, dy, ax, ay, bx, by)) return true;
  if (Math.abs(cdA) <= GEOMETRY_EPSILON && pointOnSegment(ax, ay, cx, cy, dx, dy)) return true;
  return Math.abs(cdB) <= GEOMETRY_EPSILON && pointOnSegment(bx, by, cx, cy, dx, dy);
}

function pointOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): boolean {
  return (
    px >= Math.min(ax, bx) - GEOMETRY_EPSILON &&
    px <= Math.max(ax, bx) + GEOMETRY_EPSILON &&
    py >= Math.min(ay, by) - GEOMETRY_EPSILON &&
    py <= Math.max(ay, by) + GEOMETRY_EPSILON
  );
}

function removeConsecutiveDuplicates(source: readonly number[]): number[] {
  const result: number[] = [];
  for (let i = 0; i < source.length; i += 2) {
    if (
      result.length > 0 &&
      approximatelyEqual(result[result.length - 2], source[i]) &&
      approximatelyEqual(result[result.length - 1], source[i + 1])
    )
      continue;
    result.push(source[i], source[i + 1]);
  }
  return result;
}

function reversePoints(points: readonly number[]): number[] {
  const result: number[] = [];
  for (let i = points.length - 2; i >= 0; i -= 2) result.push(points[i], points[i + 1]);
  return result;
}

function areFinitePoints(points: readonly number[]): boolean {
  for (let i = 0; i < points.length; i++) if (!Number.isFinite(points[i])) return false;
  return true;
}

function samePoint(points: readonly number[], a: number, b: number): boolean {
  return approximatelyEqual(points[a * 2], points[b * 2]) && approximatelyEqual(points[a * 2 + 1], points[b * 2 + 1]);
}

function approximatelyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= GEOMETRY_EPSILON;
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

const EMPTY_DASH: readonly number[] = [];
const GEOMETRY_EPSILON = 1e-8;
