// Generated from crates/flight-path/src/stroke_path_geometry.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { flattenPath } from './flattenPath.ts';
import type { PathRaw, StrokeCap, StrokeJoin, StrokePathTessellationReason, StrokeStyle } from './path.ts';

export interface StrokePathPieceGeometry {
  closed: boolean;
  endCap: number[];
  left: number[];
  right: number[];
  startCap: number[];
}

export interface StrokePathGeometry {
  issue: StrokePathTessellationReason;
  issueSubpath?: number;
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

interface BuildResult {
  issue: StrokePathTessellationReason;
  piece?: StrokePathPieceGeometry;
}

/**
 * Numeric stroke tessellation issue codes, in the order of the matching reason enum (TS `StrokePathTessellationIssueNone`…).
 */
export const StrokePathTessellationIssueNone: number = 0;

export const StrokePathTessellationIssueInvalidStyle: number = 1;

export const StrokePathTessellationIssueInvalidPath: number = 2;

export const StrokePathTessellationIssueSelfIntersectingCenterline: number = 3;

export const StrokePathTessellationIssueReversingJoin: number = 4;

export const StrokePathTessellationIssueSelfIntersectingOutline: number = 5;

const GEOMETRY_EPSILON: number = 1e-8;

function createArcInteriorPoints(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  sweep: number,
  tolerance: number,
): number[] {
  const points = createArcPoints(cx, cy, radius, startAngle, sweep, tolerance);
  if (points.length <= 4) {
    return [] as never[];
  }
  return [...points.slice(2, points.length - 2)];
}

function createArcPoints(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  sweep: number,
  tolerance: number,
): number[] {
  const ratio = Math.min(Math.max(1.0 - tolerance / radius, -1.0), 1.0);
  const maxStep = Math.max(Math.PI / 32.0, 2.0 * Math.acos(ratio));
  const steps = Math.max(1, Math.ceil(Math.abs(sweep) / maxStep));
  let points: number[] = [] as never[];
  for (let i = 0; i <= steps; i += 1) {
    const angle = startAngle + (sweep * i) / steps;
    points.push(cx + Math.cos(angle) * radius);
    points.push(cy + Math.sin(angle) * radius);
  }
  return points;
}

function createStrokeSubpaths(path: Readonly<PathRaw>, tolerance: number): StrokeSubpath[] {
  const contours = flattenPath(path, tolerance);
  let result: StrokeSubpath[] = [] as never[];
  for (let i = 0; i < contours.length; i += 1) {
    const points = removeConsecutiveDuplicates(contours[i]);
    if (points.length < 4) {
      continue;
    }
    const last = points.length - 2;
    const closed =
      points.length >= 8 &&
      approximatelyEqual(points[0], points[last]) &&
      approximatelyEqual(points[1], points[last + 1]);
    let pts = points;
    if (closed) {
      pts[last] = pts[0];
      pts[last + 1] = pts[1];
    }
    result.push({ closed: closed, points: pts, sourceIndex: i });
  }
  return result;
}

function appendEndpointSection(
  piece: StrokePathPieceGeometry,
  px: number,
  py: number,
  frame: Readonly<SegmentFrame>,
  halfWidth: number,
  cap: StrokeCap,
  start: boolean,
  tolerance: number,
): void {
  const extension = cap === 'square' ? (start ? -halfWidth : halfWidth) : 0.0;
  const cx = px + frame.tx * extension;
  const cy = py + frame.ty * extension;
  appendSection(
    piece,
    cx + frame.nx * halfWidth,
    cy + frame.ny * halfWidth,
    cx - frame.nx * halfWidth,
    cy - frame.ny * halfWidth,
  );
  if (cap !== 'round') {
    return;
  }
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
  previous: Readonly<SegmentFrame>,
  next: Readonly<SegmentFrame>,
  halfWidth: number,
  join: StrokeJoin,
  miterLimit: number,
  tolerance: number,
): StrokePathTessellationReason {
  const turn = cross(previous.tx, previous.ty, next.tx, next.ty);
  const direction = previous.tx * next.tx + previous.ty * next.ty;
  if (Math.abs(turn) <= GEOMETRY_EPSILON) {
    if (direction < 0.0) {
      return 'reversing-join';
    }
    appendSection(
      piece,
      px + next.nx * halfWidth,
      py + next.ny * halfWidth,
      px - next.nx * halfWidth,
      py - next.ny * halfWidth,
    );
    return 'ok';
  }
  const left0x = px + previous.nx * halfWidth;
  const left0y = py + previous.ny * halfWidth;
  const left1x = px + next.nx * halfWidth;
  const left1y = py + next.ny * halfWidth;
  const right0x = px - previous.nx * halfWidth;
  const right0y = py - previous.ny * halfWidth;
  const right1x = px - next.nx * halfWidth;
  const right1y = py - next.ny * halfWidth;
  const leftIntersection = intersectLines(left0x, left0y, previous.tx, previous.ty, left1x, left1y, next.tx, next.ty);
  const rightIntersection = intersectLines(
    right0x,
    right0y,
    previous.tx,
    previous.ty,
    right1x,
    right1y,
    next.tx,
    next.ty,
  );
  if (leftIntersection === undefined || rightIntersection === undefined) {
    return 'reversing-join';
  }
  const leftInt = leftIntersection!;
  const rightInt = rightIntersection!;
  const outerIntersection = turn > 0.0 ? rightInt : leftInt;
  const outerDistance = Math.sqrt(Math.pow(outerIntersection[0] - px, 2) + Math.pow(outerIntersection[1] - py, 2));
  if (join === 'miter' && Number.isFinite(miterLimit) && outerDistance <= halfWidth * Math.max(miterLimit, 0.0)) {
    appendSection(piece, leftInt[0], leftInt[1], rightInt[0], rightInt[1]);
    return 'ok';
  }
  const inner = turn > 0.0 ? leftInt : rightInt;
  if (join === 'round') {
    const outer0x = turn > 0.0 ? right0x : left0x;
    const outer0y = turn > 0.0 ? right0y : left0y;
    const outerStartAngle = Math.atan2(outer0y - py, outer0x - px);
    const sweep = signedJoinSweep(previous, next, turn);
    const outer = createArcPoints(px, py, halfWidth, outerStartAngle, sweep, tolerance);
    let i = 0;
    while (i < outer.length) {
      if (turn > 0.0) {
        appendSection(piece, inner[0], inner[1], outer[i], outer[i + 1]);
      } else {
        appendSection(piece, outer[i], outer[i + 1], inner[0], inner[1]);
      }
      i += 2;
    }
  } else {
    if (turn > 0.0) {
      appendSection(piece, inner[0], inner[1], right0x, right0y);
      appendSection(piece, inner[0], inner[1], right1x, right1y);
    } else {
      appendSection(piece, left0x, left0y, inner[0], inner[1]);
      appendSection(piece, left1x, left1y, inner[0], inner[1]);
    }
  }
  return 'ok';
}

function appendSection(piece: StrokePathPieceGeometry, lx: number, ly: number, rx: number, ry: number): void {
  piece.left.push(lx);
  piece.left.push(ly);
  piece.right.push(rx);
  piece.right.push(ry);
}

function applyDash(subpath: Readonly<StrokeSubpath>, dash: Readonly<number[]>, dashOffset: number): StrokeSubpath[] {
  let pattern: number[] = [...dash];
  if (dash.length % 2 !== 0) {
    for (let index = 0, count = dash.length; index < count; index++) {
      pattern.push(dash[index]);
    }
  }
  const total: number = pattern.reduce((sum, value) => sum + value, 0);
  if (total <= GEOMETRY_EPSILON) {
    return [{ closed: subpath.closed, points: subpath.points.slice(), sourceIndex: subpath.sourceIndex }];
  }
  const offset = ((dashOffset % total) + total) % total;
  let patternIndex: number = 0;
  let consumedOffset = offset;
  for (;;) {
    if (pattern[patternIndex] > GEOMETRY_EPSILON && consumedOffset < pattern[patternIndex]) {
      break;
    }
    if (pattern[patternIndex] > GEOMETRY_EPSILON) {
      consumedOffset -= pattern[patternIndex];
    }
    patternIndex = (patternIndex + 1) % pattern.length;
  }
  let remaining = pattern[patternIndex] - consumedOffset;
  let on = patternIndex % 2 === 0;
  let result: StrokeSubpath[] = [] as never[];
  let current: number[] | undefined = undefined;
  const points = subpath.points;
  const segCount = Math.trunc(points.length / 2) - 1;
  for (let segment = 0; segment < segCount; segment += 1) {
    const x0 = points[segment * 2];
    const y0 = points[segment * 2 + 1];
    const x1 = points[(segment + 1) * 2];
    const y1 = points[(segment + 1) * 2 + 1];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const length = Math.sqrt(dx * dx + dy * dy);
    let distance: number = 0.0;
    while (distance < length - GEOMETRY_EPSILON) {
      while (remaining <= GEOMETRY_EPSILON) {
        patternIndex = (patternIndex + 1) % pattern.length;
        remaining = pattern[patternIndex];
        on = patternIndex % 2 === 0;
        if (!on) {
          if (current !== undefined) {
            const c = current;
            current = undefined;
            pushDash(result, c, subpath.sourceIndex);
          }
        }
      }
      const step = Math.min(remaining, length - distance);
      const startX = x0 + (dx * distance) / length;
      const startY = y0 + (dy * distance) / length;
      distance += step;
      const endX = x0 + (dx * distance) / length;
      const endY = y0 + (dy * distance) / length;
      if (on) {
        if (current === undefined) {
          current = [startX, startY];
        }
        current!.push(endX);
        current!.push(endY);
      } else {
        if (current !== undefined) {
          const c = current;
          current = undefined;
          pushDash(result, c, subpath.sourceIndex);
        }
      }
      remaining -= step;
    }
  }
  if (current !== undefined) {
    const c = current;
    pushDash(result, c, subpath.sourceIndex);
  }
  return result;
}

function approximatelyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= GEOMETRY_EPSILON;
}

function areFinitePoints(points: Readonly<number[]>): boolean {
  for (let i = 0; i < points.length; i += 1) {
    if (!Number.isFinite(points[i])) {
      return false;
    }
  }
  return true;
}

/**
 * Shared stroke kernel used by both strokePath and tessellateStrokePath.
 */
export function buildStrokePathGeometry(
  path: Readonly<PathRaw>,
  style: Readonly<StrokeStyle>,
  tolerance: number,
): StrokePathGeometry {
  const width = style.width ?? 1.0;
  const dashOffset = style.dashOffset ?? 0.0;
  const miterLimit = style.miterLimit ?? 4.0;
  if (
    !Number.isFinite(width) ||
    width <= 0.0 ||
    !Number.isFinite(tolerance) ||
    tolerance <= 0.0 ||
    !Number.isFinite(dashOffset) ||
    !Number.isFinite(miterLimit) ||
    miterLimit < 0.0
  ) {
    return { issue: 'invalid-style', issueSubpath: undefined, pieces: [] };
  }
  const dashPattern: number[] = (() => {
    const matchValue = style.dash;
    if (matchValue !== undefined) {
      const pattern = matchValue;
      return pattern;
    } else {
      return [] as never[];
    }
  })();
  const dash = dashPattern;
  for (let i = 0; i < dash.length; i += 1) {
    if (!Number.isFinite(dash[i]) || dash[i] < 0.0) {
      return { issue: 'invalid-style', issueSubpath: undefined, pieces: [] };
    }
  }
  const source = createStrokeSubpaths(path, tolerance);
  for (let i = 0; i < source.length; i += 1) {
    if (!areFinitePoints(source[i].points)) {
      return { issue: 'invalid-path', issueSubpath: source[i].sourceIndex, pieces: [] };
    }
  }
  const centerlineIntersection = findCenterlineIntersection(source);
  let issue: StrokePathTessellationReason =
    centerlineIntersection === undefined ? 'ok' : 'self-intersecting-centerline';
  let issueSubpath = centerlineIntersection;
  let pieces: StrokePathPieceGeometry[] = [] as never[];
  const halfWidth = width / 2.0;
  const cap = style.cap ?? 'butt';
  const join = style.join ?? 'miter';
  for (let i = 0; i < source.length; i += 1) {
    const subpath = source[i];
    const spans =
      dash.length !== 0
        ? applyDash(subpath, dash, dashOffset)
        : [{ closed: subpath.closed, points: subpath.points, sourceIndex: subpath.sourceIndex }];
    for (let j = 0; j < spans.length; j += 1) {
      const built = buildStrokePiece(spans[j], halfWidth, join, cap, miterLimit, tolerance);
      if (built.piece !== undefined) {
        const piece = built.piece;
        if (issue === 'ok' && hasInvalidOutline(piece)) {
          issue = 'self-intersecting-outline';
          issueSubpath = subpath.sourceIndex;
        }
        pieces.push(piece);
      }
      if (issue === 'ok' && built.issue !== 'ok') {
        issue = built.issue;
        issueSubpath = subpath.sourceIndex;
      }
    }
  }
  return { issue: issue, issueSubpath: issueSubpath, pieces: pieces };
}

function buildStrokePiece(
  subpath: Readonly<StrokeSubpath>,
  halfWidth: number,
  join: StrokeJoin,
  cap: StrokeCap,
  miterLimit: number,
  tolerance: number,
): BuildResult {
  const points = subpath.points;
  const pointCount = Math.trunc(points.length / 2);
  const segmentCount = pointCount - 1;
  if (segmentCount < 1) {
    return { issue: 'ok', piece: undefined };
  }
  let frames: SegmentFrame[] = [] as never[];
  for (let i = 0; i < segmentCount; i += 1) {
    const x0 = points[i * 2];
    const y0 = points[i * 2 + 1];
    const dx = points[(i + 1) * 2] - x0;
    const dy = points[(i + 1) * 2 + 1] - y0;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length <= GEOMETRY_EPSILON) {
      continue;
    }
    const tx = dx / length;
    const ty = dy / length;
    frames.push({ nx: -ty, ny: tx, tx: tx, ty: ty });
  }
  if (frames.length !== segmentCount) {
    return { issue: 'invalid-path', piece: undefined };
  }
  let piece: StrokePathPieceGeometry = { closed: subpath.closed, endCap: [], left: [], right: [], startCap: [] };
  if (!subpath.closed) {
    appendEndpointSection(piece, points[0], points[1], frames[0], halfWidth, cap, true, tolerance);
    for (let i = 1; i < pointCount - 1; i += 1) {
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
      if (issue !== 'ok') {
        return { issue: issue, piece: piece };
      }
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
    for (let i = 0; i < uniquePointCount; i += 1) {
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
      if (issue !== 'ok') {
        return { issue: issue, piece: piece };
      }
    }
  }
  return { issue: 'ok', piece: piece };
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

function doPolylinesIntersect(
  a: Readonly<number[]>,
  aClosed: boolean,
  b: Readonly<number[]>,
  bClosed: boolean,
): boolean {
  const aCount = getPolylinePointCount(a, aClosed);
  const bCount = getPolylinePointCount(b, bClosed);
  const aSegments = aClosed ? aCount : aCount - 1;
  const bSegments = bClosed ? bCount : bCount - 1;
  for (let i = 0; i < aSegments; i += 1) {
    const iNext = (i + 1) % aCount;
    if (samePoint(a, i, iNext)) {
      continue;
    }
    for (let j = 0; j < bSegments; j += 1) {
      const jNext = (j + 1) % bCount;
      if (samePoint(b, j, jNext)) {
        continue;
      }
      if (segmentsIntersect(a, i, iNext, b, j, jNext)) {
        return true;
      }
    }
  }
  return false;
}

function findCenterlineIntersection(subpaths: Readonly<StrokeSubpath[]>): number | undefined {
  for (let i = 0; i < subpaths.length; i += 1) {
    if (hasPolylineSelfIntersection(subpaths[i].points, subpaths[i].closed)) {
      return subpaths[i].sourceIndex;
    }
    for (let j = 0; j < i; j += 1) {
      if (doPolylinesIntersect(subpaths[i].points, subpaths[i].closed, subpaths[j].points, subpaths[j].closed)) {
        return subpaths[i].sourceIndex;
      }
    }
  }
  return undefined;
}

function getPolylinePointCount(points: Readonly<number[]>, closed: boolean): number {
  const count = Math.trunc(points.length / 2);
  if (closed && count > 1 && samePoint(points, 0, count - 1)) {
    return count - 1;
  }
  return count;
}

function hasInvalidOutline(piece: Readonly<StrokePathPieceGeometry>): boolean {
  const left = removeConsecutiveDuplicates(piece.left);
  const right = removeConsecutiveDuplicates(piece.right);
  if (piece.closed) {
    return (
      hasPolylineSelfIntersection(left, true) ||
      hasPolylineSelfIntersection(right, true) ||
      doPolylinesIntersect(left, true, right, true)
    );
  }
  let outline = left;
  for (let index = 0, count = piece.endCap.length; index < count; index++) {
    outline.push(piece.endCap[index]);
  }
  const revRight = reversePoints(right);
  for (let index = 0, count = revRight.length; index < count; index++) {
    outline.push(revRight[index]);
  }
  for (let index = 0, count = piece.startCap.length; index < count; index++) {
    outline.push(piece.startCap[index]);
  }
  outline = removeConsecutiveDuplicates(outline);
  return hasPolylineSelfIntersection(outline, true);
}

function hasPolylineSelfIntersection(points: Readonly<number[]>, closed: boolean): boolean {
  const count = getPolylinePointCount(points, closed);
  const segmentCount = closed ? count : count - 1;
  for (let i = 0; i < segmentCount; i += 1) {
    const iNext = (i + 1) % count;
    if (samePoint(points, i, iNext)) {
      continue;
    }
    for (let j = i + 1; j < segmentCount; j += 1) {
      const jNext = (j + 1) % count;
      if (samePoint(points, j, jNext) || segmentsAreAdjacent(i, j, segmentCount, closed)) {
        continue;
      }
      if (segmentsIntersect(points, i, iNext, points, j, jNext)) {
        return true;
      }
    }
  }
  return false;
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
): readonly [number, number] | undefined {
  const denominator = cross(adx, ady, bdx, bdy);
  if (Math.abs(denominator) <= GEOMETRY_EPSILON) {
    return undefined;
  }
  const scale = cross(bx - ax, by - ay, bdx, bdy) / denominator;
  return [ax + adx * scale, ay + ady * scale];
}

function pointOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): boolean {
  return (
    px >= Math.min(ax, bx) - GEOMETRY_EPSILON &&
    px <= Math.max(ax, bx) + GEOMETRY_EPSILON &&
    py >= Math.min(ay, by) - GEOMETRY_EPSILON &&
    py <= Math.max(ay, by) + GEOMETRY_EPSILON
  );
}

function pushDash(result: StrokeSubpath[], points: number[], sourceIndex: number): void {
  if (points.length >= 4) {
    result.push({ closed: false, points: points, sourceIndex: sourceIndex });
  }
}

function removeConsecutiveDuplicates(source: Readonly<number[]>): number[] {
  let result: number[] = [] as never[];
  let i = 0;
  while (i < source.length) {
    if (
      result.length > 0 &&
      approximatelyEqual(result[result.length - 2], source[i]) &&
      approximatelyEqual(result[result.length - 1], source[i + 1])
    ) {
      i += 2;
      continue;
    }
    result.push(source[i]);
    result.push(source[i + 1]);
    i += 2;
  }
  return result;
}

function reversePoints(points: Readonly<number[]>): number[] {
  let result: number[] = [] as never[];
  let i = points.length - 2;
  while (i >= 0) {
    result.push(points[i]);
    result.push(points[i + 1]);
    i -= 2;
  }
  return result;
}

function samePoint(points: Readonly<number[]>, a: number, b: number): boolean {
  return approximatelyEqual(points[a * 2], points[b * 2]) && approximatelyEqual(points[a * 2 + 1], points[b * 2 + 1]);
}

function segmentsAreAdjacent(a: number, b: number, segmentCount: number, closed: boolean): boolean {
  if (b === a + 1) {
    return true;
  }
  return closed && a === 0 && b === segmentCount - 1;
}

function segmentsIntersect(
  a: Readonly<number[]>,
  ai: number,
  aj: number,
  b: Readonly<number[]>,
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
  if (Math.abs(abC) <= GEOMETRY_EPSILON && pointOnSegment(cx, cy, ax, ay, bx, by)) {
    return true;
  }
  if (Math.abs(abD) <= GEOMETRY_EPSILON && pointOnSegment(dx, dy, ax, ay, bx, by)) {
    return true;
  }
  if (Math.abs(cdA) <= GEOMETRY_EPSILON && pointOnSegment(ax, ay, cx, cy, dx, dy)) {
    return true;
  }
  return Math.abs(cdB) <= GEOMETRY_EPSILON && pointOnSegment(bx, by, cx, cy, dx, dy);
}

function signedJoinSweep(previous: Readonly<SegmentFrame>, next: Readonly<SegmentFrame>, turn: number): number {
  const start = turn > 0.0 ? Math.atan2(-previous.ny, -previous.nx) : Math.atan2(previous.ny, previous.nx);
  const end = turn > 0.0 ? Math.atan2(-next.ny, -next.nx) : Math.atan2(next.ny, next.nx);
  let sweep = end - start;
  if (turn > 0.0 && sweep < 0.0) {
    sweep += Math.PI * 2.0;
  }
  if (turn < 0.0 && sweep > 0.0) {
    sweep -= Math.PI * 2.0;
  }
  return sweep;
}
