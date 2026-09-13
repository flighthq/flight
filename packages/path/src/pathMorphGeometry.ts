import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, Path, PathMorph } from '@flighthq/types/contract';
import { PathCommand } from '@flighthq/types/contract';

import { forEachPathSegment } from './forEachPathSegment';

export const PathMorphIssueNone = 0;
export const PathMorphIssueWindingMismatch = 1;
export const PathMorphIssueContourCountMismatch = 2;
export const PathMorphIssueContourClosednessMismatch = 3;
export const PathMorphIssueContourOrientationMismatch = 4;

interface PathMorphBuildResult {
  contour: number | null;
  issue: number;
  morph: PathMorph | null;
}

// Shared preparation used by the production constructor and its separately importable diagnostic.
// Lines and quadratics are converted exactly to cubics, then the lower-segment endpoint is subdivided
// without changing its geometry. This is deliberately a one-time allocating step; sampling stays a
// flat coordinate loop.
export function buildPathMorph(start: Readonly<Path>, end: Readonly<Path>): PathMorphBuildResult {
  if (start.winding !== end.winding) {
    return { contour: null, issue: PathMorphIssueWindingMismatch, morph: null };
  }

  const startContours = decodeCubicContours(start);
  const endContours = decodeCubicContours(end);
  if (startContours.length !== endContours.length) {
    return { contour: null, issue: PathMorphIssueContourCountMismatch, morph: null };
  }

  for (let i = 0; i < startContours.length; i++) {
    if (startContours[i].closed !== endContours[i].closed) {
      return { contour: i, issue: PathMorphIssueContourClosednessMismatch, morph: null };
    }
  }

  const orientationMismatch = normalizeCubicContourOrientations(startContours, endContours, start.winding);
  if (orientationMismatch !== null) {
    return { contour: orientationMismatch, issue: PathMorphIssueContourOrientationMismatch, morph: null };
  }

  for (let i = 0; i < startContours.length; i++) {
    const startContour = startContours[i];
    const endContour = endContours[i];
    equalizeCubicContourSegments(startContour, endContour);
    alignClosedCubicContour(startContour, endContour);
  }

  const commands: number[] = [];
  const startData: number[] = [];
  const endData: number[] = [];
  for (let i = 0; i < startContours.length; i++) {
    appendCubicContourPair(commands, startData, endData, startContours[i], endContours[i]);
  }
  return {
    contour: null,
    issue: PathMorphIssueNone,
    morph: (() => {
      const out = allocateEntity<PathMorph>();
      initializePathMorph(out, commands, endData, startData, start.winding);
      return finishEntity(out);
    })(),
  };
}

export function initializePathMorph(
  out: EntityConstruction<PathMorph>,
  commands: number[],
  endData: number[],
  startData: number[],
  winding: Path['winding'],
): void {
  out.commands = commands;
  out.endData = endData;
  out.startData = startData;
  out.winding = winding;
}

// Opposite traversal makes equally-authored closed shapes fold through themselves during coordinate
// interpolation. Even-odd paths may reverse each contour independently because direction has no fill
// meaning. Non-zero paths may only reverse the entire endpoint consistently: that negates every
// winding number without changing what is filled, while reversing a subset could turn a hole into a
// solid ring. Returns the first contour whose relationship prevents that safe normalization.
function normalizeCubicContourOrientations(
  start: readonly CubicContour[],
  end: CubicContour[],
  winding: Path['winding'],
): number | null {
  if (winding === 'evenOdd') {
    for (let i = 0; i < start.length; i++) {
      const startOrientation = getCubicContourOrientation(start[i]);
      const endOrientation = getCubicContourOrientation(end[i]);
      if (startOrientation !== 0 && endOrientation !== 0 && startOrientation !== endOrientation) {
        reverseClosedCubicContour(end[i]);
      }
    }
    return null;
  }

  let reverseEnd: boolean | null = null;
  for (let i = 0; i < start.length; i++) {
    const startOrientation = getCubicContourOrientation(start[i]);
    const endOrientation = getCubicContourOrientation(end[i]);
    if (startOrientation === 0 || endOrientation === 0) continue;
    const reversed = startOrientation !== endOrientation;
    if (reverseEnd === null) reverseEnd = reversed;
    else if (reverseEnd !== reversed) return i;
  }
  if (reverseEnd === true) {
    for (let i = 0; i < end.length; i++) {
      if (getCubicContourOrientation(end[i]) !== 0) reverseClosedCubicContour(end[i]);
    }
  }
  return null;
}

function getCubicContourOrientation(contour: Readonly<CubicContour>): number {
  if (!contour.closed) return 0;
  const area = getCubicContourSignedArea(contour);
  return area < 0 ? -1 : area > 0 ? 1 : 0;
}

function reverseClosedCubicContour(contour: CubicContour): void {
  const reversed: CubicSegment[] = [];
  for (let i = contour.segments.length - 1; i >= 0; i--) {
    const segment = contour.segments[i];
    reversed.push({
      controlX1: segment.controlX2,
      controlY1: segment.controlY2,
      controlX2: segment.controlX1,
      controlY2: segment.controlY1,
      x0: segment.x1,
      x1: segment.x0,
      y0: segment.y1,
      y1: segment.y0,
    });
  }
  contour.segments = reversed;
  if (reversed.length > 0) {
    contour.x = reversed[0].x0;
    contour.y = reversed[0].y0;
  }
  contour.currentX = contour.x;
  contour.currentY = contour.y;
}

// Exact Green's-theorem area integral over cubic power-basis coefficients. This avoids introducing a
// flattening tolerance into morph compatibility and handles curved contours as deterministically as
// polygonal ones.
function getCubicContourSignedArea(contour: Readonly<CubicContour>): number {
  let twiceArea = 0;
  let extent = 0;
  for (let i = 0; i < contour.segments.length; i++) {
    const segment = contour.segments[i];
    const x0 = segment.x0 - contour.x;
    const controlX1 = segment.controlX1 - contour.x;
    const controlX2 = segment.controlX2 - contour.x;
    const x1 = segment.x1 - contour.x;
    const y0 = segment.y0 - contour.y;
    const controlY1 = segment.controlY1 - contour.y;
    const controlY2 = segment.controlY2 - contour.y;
    const y1 = segment.y1 - contour.y;
    extent = Math.max(
      extent,
      Math.abs(x0),
      Math.abs(controlX1),
      Math.abs(controlX2),
      Math.abs(x1),
      Math.abs(y0),
      Math.abs(controlY1),
      Math.abs(controlY2),
      Math.abs(y1),
    );
    const x = getCubicPowerCoefficients(x0, controlX1, controlX2, x1);
    const y = getCubicPowerCoefficients(y0, controlY1, controlY2, y1);
    for (let xi = 0; xi < 4; xi++) {
      for (let yi = 1; yi < 4; yi++) {
        twiceArea += (x[xi] * yi * y[yi] - y[xi] * yi * x[yi]) / (xi + yi);
      }
    }
  }
  const area = twiceArea / 2;
  const areaEpsilon = Math.max(1, extent * extent) * Number.EPSILON * 64;
  return Math.abs(area) <= areaEpsilon ? 0 : area;
}

function getCubicPowerCoefficients(p0: number, p1: number, p2: number, p3: number): readonly number[] {
  return [p0, 3 * (p1 - p0), 3 * (p0 - 2 * p1 + p2), -p0 + 3 * p1 - 3 * p2 + p3];
}

function alignClosedCubicContour(start: Readonly<CubicContour>, end: CubicContour): void {
  const count = start.segments.length;
  if (!start.closed || count < 2) return;
  let bestOffset = 0;
  let bestDistance = Infinity;
  for (let offset = 0; offset < count; offset++) {
    let distance = 0;
    for (let i = 0; i < count; i++) {
      const a = start.segments[i];
      const b = end.segments[(i + offset) % count];
      const dx = a.x0 - b.x0;
      const dy = a.y0 - b.y0;
      distance += dx * dx + dy * dy;
    }
    if (distance < bestDistance) {
      bestDistance = distance;
      bestOffset = offset;
    }
  }
  if (bestOffset === 0) return;
  end.segments = end.segments.slice(bestOffset).concat(end.segments.slice(0, bestOffset));
  end.x = end.segments[0].x0;
  end.y = end.segments[0].y0;
}

function appendCubicContourPair(
  commands: number[],
  startData: number[],
  endData: number[],
  start: Readonly<CubicContour>,
  end: Readonly<CubicContour>,
): void {
  commands.push(PathCommand.MOVE_TO);
  startData.push(start.x, start.y);
  endData.push(end.x, end.y);
  for (let i = 0; i < start.segments.length; i++) {
    const a = start.segments[i];
    const b = end.segments[i];
    commands.push(PathCommand.CUBIC_CURVE_TO);
    startData.push(a.controlX1, a.controlY1, a.controlX2, a.controlY2, a.x1, a.y1);
    endData.push(b.controlX1, b.controlY1, b.controlX2, b.controlY2, b.x1, b.y1);
  }
  if (start.closed) commands.push(PathCommand.CLOSE);
}

function appendCubicSegment(
  contour: CubicContour,
  controlX1: number,
  controlY1: number,
  controlX2: number,
  controlY2: number,
  x: number,
  y: number,
): void {
  contour.segments.push({
    controlX1,
    controlY1,
    controlX2,
    controlY2,
    x0: contour.currentX,
    x1: x,
    y0: contour.currentY,
    y1: y,
  });
  contour.currentX = x;
  contour.currentY = y;
}

function appendLineAsCubic(contour: CubicContour, x: number, y: number): void {
  const x0 = contour.currentX;
  const y0 = contour.currentY;
  appendCubicSegment(
    contour,
    x0 + (x - x0) / 3,
    y0 + (y - y0) / 3,
    x0 + ((x - x0) * 2) / 3,
    y0 + ((y - y0) * 2) / 3,
    x,
    y,
  );
}

function appendQuadraticAsCubic(contour: CubicContour, controlX: number, controlY: number, x: number, y: number): void {
  const x0 = contour.currentX;
  const y0 = contour.currentY;
  appendCubicSegment(
    contour,
    x0 + ((controlX - x0) * 2) / 3,
    y0 + ((controlY - y0) * 2) / 3,
    x + ((controlX - x) * 2) / 3,
    y + ((controlY - y) * 2) / 3,
    x,
    y,
  );
}

function closeCubicContour(contour: CubicContour): void {
  if (contour.currentX !== contour.x || contour.currentY !== contour.y) {
    appendLineAsCubic(contour, contour.x, contour.y);
  }
  contour.closed = true;
}

function createCubicContour(x: number, y: number): CubicContour {
  return { closed: false, currentX: x, currentY: y, segments: [], x, y };
}

function cubicControlPolygonLength(segment: Readonly<CubicSegment>): number {
  return (
    pointDistance(segment.x0, segment.y0, segment.controlX1, segment.controlY1) +
    pointDistance(segment.controlX1, segment.controlY1, segment.controlX2, segment.controlY2) +
    pointDistance(segment.controlX2, segment.controlY2, segment.x1, segment.y1)
  );
}

function decodeCubicContours(path: Readonly<Path>): CubicContour[] {
  const contours: CubicContour[] = [];
  let contour: CubicContour | null = null;
  const ensureContour = (): CubicContour => {
    if (contour !== null) return contour;
    contour = createCubicContour(0, 0);
    contours.push(contour);
    return contour;
  };
  forEachPathSegment(path, (segment) => {
    if (segment.kind === 'moveTo') {
      contour = createCubicContour(segment.x, segment.y);
      contours.push(contour);
    } else if (segment.kind === 'lineTo') {
      appendLineAsCubic(ensureContour(), segment.x, segment.y);
    } else if (segment.kind === 'quadraticCurveTo') {
      appendQuadraticAsCubic(ensureContour(), segment.controlX, segment.controlY, segment.x, segment.y);
    } else if (segment.kind === 'cubicCurveTo') {
      appendCubicSegment(
        ensureContour(),
        segment.controlX1,
        segment.controlY1,
        segment.controlX2,
        segment.controlY2,
        segment.x,
        segment.y,
      );
    } else if (segment.kind === 'close' && contour !== null) {
      closeCubicContour(contour);
      contour = null;
    }
  });
  return contours;
}

function equalizeCubicContourSegments(start: CubicContour, end: CubicContour): void {
  const targetCount = Math.max(start.segments.length, end.segments.length);
  if (targetCount === 0) return;
  start.segments = subdivideCubicSegments(start.segments, targetCount, start.x, start.y);
  end.segments = subdivideCubicSegments(end.segments, targetCount, end.x, end.y);
}

function pointDistance(x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  return Math.sqrt(dx * dx + dy * dy);
}

function splitCubicSegment(segment: Readonly<CubicSegment>, t: number): [CubicSegment, CubicSegment] {
  const x01 = segment.x0 + (segment.controlX1 - segment.x0) * t;
  const y01 = segment.y0 + (segment.controlY1 - segment.y0) * t;
  const x12 = segment.controlX1 + (segment.controlX2 - segment.controlX1) * t;
  const y12 = segment.controlY1 + (segment.controlY2 - segment.controlY1) * t;
  const x23 = segment.controlX2 + (segment.x1 - segment.controlX2) * t;
  const y23 = segment.controlY2 + (segment.y1 - segment.controlY2) * t;
  const x012 = x01 + (x12 - x01) * t;
  const y012 = y01 + (y12 - y01) * t;
  const x123 = x12 + (x23 - x12) * t;
  const y123 = y12 + (y23 - y12) * t;
  const x = x012 + (x123 - x012) * t;
  const y = y012 + (y123 - y012) * t;
  return [
    {
      controlX1: x01,
      controlY1: y01,
      controlX2: x012,
      controlY2: y012,
      x0: segment.x0,
      x1: x,
      y0: segment.y0,
      y1: y,
    },
    {
      controlX1: x123,
      controlY1: y123,
      controlX2: x23,
      controlY2: y23,
      x0: x,
      x1: segment.x1,
      y0: y,
      y1: segment.y1,
    },
  ];
}

function subdivideCubicSegments(
  source: readonly CubicSegment[],
  targetCount: number,
  pointX: number,
  pointY: number,
): CubicSegment[] {
  if (source.length === targetCount) return source.slice();
  if (source.length === 0) {
    const segments: CubicSegment[] = [];
    for (let i = 0; i < targetCount; i++) {
      segments.push({
        controlX1: pointX,
        controlY1: pointY,
        controlX2: pointX,
        controlY2: pointY,
        x0: pointX,
        x1: pointX,
        y0: pointY,
        y1: pointY,
      });
    }
    return segments;
  }

  const partCounts = new Array<number>(source.length).fill(1);
  const lengths = source.map(cubicControlPolygonLength);
  for (let total = source.length; total < targetCount; total++) {
    let best = 0;
    let bestLength = -1;
    for (let i = 0; i < source.length; i++) {
      const partLength = lengths[i] / partCounts[i];
      if (partLength > bestLength) {
        best = i;
        bestLength = partLength;
      }
    }
    partCounts[best]++;
  }

  const segments: CubicSegment[] = [];
  for (let i = 0; i < source.length; i++) {
    let remainder = source[i];
    for (let parts = partCounts[i]; parts > 1; parts--) {
      const split = splitCubicSegment(remainder, 1 / parts);
      segments.push(split[0]);
      remainder = split[1];
    }
    segments.push(remainder);
  }
  return segments;
}

interface CubicContour {
  closed: boolean;
  currentX: number;
  currentY: number;
  segments: CubicSegment[];
  x: number;
  y: number;
}

interface CubicSegment {
  controlX1: number;
  controlY1: number;
  controlX2: number;
  controlY2: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
