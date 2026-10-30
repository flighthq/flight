// Generated from crates/flight-path/src/path_morph_geometry.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityConstruction } from '@flighthq/entity/contract';

import { forEachPathSegment } from './forEachPathSegment.ts';
import type { PathMorphCreationReason, PathMorphRaw, PathRaw, PathSegment, PathWinding } from './path.ts';
import { PathCommand } from './path.ts';

export interface PathMorphBuildResult {
  contour?: number;
  issue: PathMorphCreationReason;
  morph?: PathMorphRaw;
}

/**
 * A validated, aligned morph before allocation: the interleaved commands and per-endpoint data, or
 * the first incompatibility with empty vectors.
 */
interface PathMorphPreparation {
  commands: number[];
  contour?: number;
  endData: number[];
  issue: PathMorphCreationReason;
  startData: number[];
}

interface CubicSegment {
  controlX1: number;
  controlY1: number;
  controlX2: number;
  controlY2: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface CubicContour {
  closed: boolean;
  currentX: number;
  currentY: number;
  segments: CubicSegment[];
  x: number;
  y: number;
}

/**
 * Numeric path-morph creation issue codes, in the order of the matching reason enum (TS `PathMorphIssueNone`…).
 */
export const PathMorphIssueNone: number = 0;

export const PathMorphIssueWindingMismatch: number = 1;

export const PathMorphIssueContourCountMismatch: number = 2;

export const PathMorphIssueContourClosednessMismatch: number = 3;

export const PathMorphIssueContourOrientationMismatch: number = 4;

function allocatePathMorph(preparation: PathMorphPreparation, winding: PathWinding): PathMorphRaw {
  let morph: PathMorphRaw = Object.assign(allocateEntity<PathMorphRaw>(), { commands: [], endData: [], startData: [] });
  initializePathMorph(morph, preparation.commands, preparation.endData, preparation.startData, winding);
  return morph;
}

function createCubicContour(x: number, y: number): CubicContour {
  return { closed: false, currentX: x, currentY: y, segments: [], x: x, y: y };
}

/**
 * Shared preparation used by the production constructor and its diagnostic.
 */
export function buildPathMorph(start: Readonly<PathRaw>, end: Readonly<PathRaw>): PathMorphBuildResult {
  const preparation = preparePathMorph(start, end);
  if (preparation.issue !== 'ok') {
    return { contour: preparation.contour, issue: preparation.issue, morph: undefined };
  }
  return { contour: undefined, issue: 'ok', morph: allocatePathMorph(preparation, start.winding) };
}

function alignClosedCubicContour(start: Readonly<CubicContour>, end: CubicContour): void {
  const count = start.segments.length;
  if (!start.closed || count < 2) {
    return;
  }
  let bestOffset: number = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let offset = 0; offset < count; offset += 1) {
    let distance: number = 0.0;
    for (let i = 0; i < count; i += 1) {
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
  if (bestOffset === 0) {
    return;
  }
  let rotated: CubicSegment[] = [] as never[];
  for (let i = 0; i < count; i += 1) {
    const src = end.segments[(i + bestOffset) % count];
    rotated.push({
      controlX1: src.controlX1,
      controlY1: src.controlY1,
      controlX2: src.controlX2,
      controlY2: src.controlY2,
      x0: src.x0,
      y0: src.y0,
      x1: src.x1,
      y1: src.y1,
    });
  }
  end.segments = rotated;
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
  commands.push(PathCommand.MOVE_TO & 0xff);
  startData.push(start.x);
  startData.push(start.y);
  endData.push(end.x);
  endData.push(end.y);
  for (let i = 0; i < start.segments.length; i += 1) {
    const a = start.segments[i];
    const b = end.segments[i];
    commands.push(PathCommand.CUBIC_CURVE_TO & 0xff);
    startData.push(a.controlX1);
    startData.push(a.controlY1);
    startData.push(a.controlX2);
    startData.push(a.controlY2);
    startData.push(a.x1);
    startData.push(a.y1);
    endData.push(b.controlX1);
    endData.push(b.controlY1);
    endData.push(b.controlX2);
    endData.push(b.controlY2);
    endData.push(b.x1);
    endData.push(b.y1);
  }
  if (start.closed) {
    commands.push(PathCommand.CLOSE & 0xff);
  }
}

function appendCubicSegment(
  contour: CubicContour,
  cx1: number,
  cy1: number,
  cx2: number,
  cy2: number,
  x: number,
  y: number,
): void {
  contour.segments.push({
    controlX1: cx1,
    controlY1: cy1,
    controlX2: cx2,
    controlY2: cy2,
    x0: contour.currentX,
    y0: contour.currentY,
    x1: x,
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
    x0 + (x - x0) / 3.0,
    y0 + (y - y0) / 3.0,
    x0 + ((x - x0) * 2.0) / 3.0,
    y0 + ((y - y0) * 2.0) / 3.0,
    x,
    y,
  );
}

function appendQuadraticAsCubic(contour: CubicContour, cx: number, cy: number, x: number, y: number): void {
  const x0 = contour.currentX;
  const y0 = contour.currentY;
  appendCubicSegment(
    contour,
    x0 + ((cx - x0) * 2.0) / 3.0,
    y0 + ((cy - y0) * 2.0) / 3.0,
    x + ((cx - x) * 2.0) / 3.0,
    y + ((cy - y) * 2.0) / 3.0,
    x,
    y,
  );
}

export function initializePathMorph(
  out: EntityConstruction<PathMorphRaw>,
  commands: number[],
  endData: number[],
  startData: number[],
  winding: PathWinding,
): void {
  out.commands = commands;
  out.endData = endData;
  out.startData = startData;
  out.winding = winding;
}

function closeCubicContour(contour: CubicContour): void {
  if (contour.currentX !== contour.x || contour.currentY !== contour.y) {
    appendLineAsCubic(contour, contour.x, contour.y);
  }
  contour.closed = true;
}

function cubicControlPolygonLength(segment: Readonly<CubicSegment>): number {
  return (
    pointDistance(segment.x0, segment.y0, segment.controlX1, segment.controlY1) +
    pointDistance(segment.controlX1, segment.controlY1, segment.controlX2, segment.controlY2) +
    pointDistance(segment.controlX2, segment.controlY2, segment.x1, segment.y1)
  );
}

function decodeCubicContours(path: Readonly<PathRaw>): CubicContour[] {
  let segments: PathSegment[] = [] as never[];
  forEachPathSegment(path, (segment) => segments.push(segment));
  let contours: CubicContour[] = [] as never[];
  let current: number | undefined = undefined;
  for (const segment of segments) {
    {
      const matchValue = segment;
      if (matchValue.kind === 'moveTo') {
        const x = matchValue.x;
        const y = matchValue.y;
        contours.push(createCubicContour(x, y));
        current = contours.length - 1;
      } else if (matchValue.kind === 'lineTo') {
        const x = matchValue.x;
        const y = matchValue.y;
        if (current === undefined) {
          contours.push(createCubicContour(0.0, 0.0));
          current = contours.length - 1;
        }
        appendLineAsCubic(contours[current!], x, y);
      } else if (matchValue.kind === 'quadraticCurveTo') {
        const controlX = matchValue.controlX;
        const controlY = matchValue.controlY;
        const x = matchValue.x;
        const y = matchValue.y;
        if (current === undefined) {
          contours.push(createCubicContour(0.0, 0.0));
          current = contours.length - 1;
        }
        appendQuadraticAsCubic(contours[current!], controlX, controlY, x, y);
      } else if (matchValue.kind === 'cubicCurveTo') {
        const controlX1 = matchValue.controlX1;
        const controlX2 = matchValue.controlX2;
        const controlY1 = matchValue.controlY1;
        const controlY2 = matchValue.controlY2;
        const x = matchValue.x;
        const y = matchValue.y;
        if (current === undefined) {
          contours.push(createCubicContour(0.0, 0.0));
          current = contours.length - 1;
        }
        appendCubicSegment(contours[current!], controlX1, controlY1, controlX2, controlY2, x, y);
      } else {
        if (current !== undefined) {
          const idx = current;
          closeCubicContour(contours[idx]);
          current = undefined;
        }
      }
    }
  }
  return contours;
}

function equalizeCubicContourSegments(start: CubicContour, end: CubicContour): void {
  const targetCount = Math.max(start.segments.length, end.segments.length);
  if (targetCount === 0) {
    return;
  }
  start.segments = subdivideCubicSegments(start.segments, targetCount, start.x, start.y);
  end.segments = subdivideCubicSegments(end.segments, targetCount, end.x, end.y);
}

function getCubicContourOrientation(contour: Readonly<CubicContour>): number {
  if (!contour.closed) {
    return 0;
  }
  const area = getCubicContourSignedArea(contour);
  if (area < 0.0) {
    return -1;
  }
  if (area > 0.0) {
    return 1;
  }
  return 0;
}

function getCubicContourSignedArea(contour: Readonly<CubicContour>): number {
  let twiceArea: number = 0.0;
  let extent: number = 0.0;
  for (let i = 0; i < contour.segments.length; i += 1) {
    const segment = contour.segments[i];
    const x0 = segment.x0 - contour.x;
    const cx1 = segment.controlX1 - contour.x;
    const cx2 = segment.controlX2 - contour.x;
    const x1 = segment.x1 - contour.x;
    const y0 = segment.y0 - contour.y;
    const cy1 = segment.controlY1 - contour.y;
    const cy2 = segment.controlY2 - contour.y;
    const y1 = segment.y1 - contour.y;
    extent = Math.max(
      Math.max(
        Math.max(
          Math.max(
            Math.max(Math.max(Math.max(Math.max(extent, Math.abs(x0)), Math.abs(cx1)), Math.abs(cx2)), Math.abs(x1)),
            Math.abs(y0),
          ),
          Math.abs(cy1),
        ),
        Math.abs(cy2),
      ),
      Math.abs(y1),
    );
    const xc = getCubicPowerCoefficients(x0, cx1, cx2, x1);
    const yc = getCubicPowerCoefficients(y0, cy1, cy2, y1);
    for (let xi = 0; xi < 4; xi += 1) {
      for (let yi = 1; yi < 4; yi += 1) {
        twiceArea += (xc[xi] * yi * yc[yi] - yc[xi] * yi * xc[yi]) / (xi + yi);
      }
    }
  }
  const area = twiceArea / 2.0;
  const areaEpsilon = Math.max(1.0, extent * extent) * Number.EPSILON * 64.0;
  if (Math.abs(area) <= areaEpsilon) {
    return 0.0;
  }
  return area;
}

function getCubicPowerCoefficients(p0: number, p1: number, p2: number, p3: number): Float64Array {
  return new Float64Array([p0, 3.0 * (p1 - p0), 3.0 * (p0 - 2.0 * p1 + p2), -p0 + 3.0 * p1 - 3.0 * p2 + p3]);
}

function normalizeCubicContourOrientations(
  start: Readonly<CubicContour[]>,
  end: CubicContour[],
  winding: PathWinding,
): number | undefined {
  if (winding === 'evenOdd') {
    for (let i = 0; i < start.length; i += 1) {
      const startOrientation = getCubicContourOrientation(start[i]);
      const endOrientation = getCubicContourOrientation(end[i]);
      if (startOrientation !== 0 && endOrientation !== 0 && startOrientation !== endOrientation) {
        reverseClosedCubicContour(end[i]);
      }
    }
    return undefined;
  }
  let reverseEnd: boolean | undefined = undefined;
  for (let i = 0; i < start.length; i += 1) {
    const startOrientation = getCubicContourOrientation(start[i]);
    const endOrientation = getCubicContourOrientation(end[i]);
    if (startOrientation === 0 || endOrientation === 0) {
      continue;
    }
    const reversed = startOrientation !== endOrientation;
    if (reverseEnd !== undefined) {
      const rev = reverseEnd;
      if (rev !== reversed) {
        return i;
      }
    } else {
      reverseEnd = reversed;
    }
  }
  if (reverseEnd === true) {
    for (let i = 0; i < end.length; i += 1) {
      if (getCubicContourOrientation(end[i]) !== 0) {
        reverseClosedCubicContour(end[i]);
      }
    }
  }
  return undefined;
}

function pointDistance(x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  return Math.sqrt(dx * dx + dy * dy);
}

function preparePathMorph(start: Readonly<PathRaw>, end: Readonly<PathRaw>): PathMorphPreparation {
  if (start.winding !== end.winding) {
    return { commands: [], contour: undefined, endData: [], issue: 'winding-mismatch', startData: [] };
  }
  const startContours = decodeCubicContours(start);
  let endContours = decodeCubicContours(end);
  if (startContours.length !== endContours.length) {
    return { commands: [], contour: undefined, endData: [], issue: 'contour-count-mismatch', startData: [] };
  }
  for (let i = 0; i < startContours.length; i += 1) {
    if (startContours[i].closed !== endContours[i].closed) {
      return { commands: [], contour: i, endData: [], issue: 'contour-closedness-mismatch', startData: [] };
    }
  }
  const orientationMismatch = normalizeCubicContourOrientations(startContours, endContours, start.winding);
  if (orientationMismatch !== undefined) {
    const idx = orientationMismatch;
    return { commands: [], contour: idx, endData: [], issue: 'contour-orientation-mismatch', startData: [] };
  }
  for (let i = 0; i < startContours.length; i += 1) {
    equalizeCubicContourSegments(startContours.slice()[i], endContours[i]);
  }
  let startContoursMut = startContours;
  for (let i = 0; i < startContoursMut.length; i += 1) {
    equalizeCubicContourSegments(startContoursMut[i], endContours[i]);
    alignClosedCubicContour(startContoursMut[i], endContours[i]);
  }
  let commands: number[] = [] as never[];
  let startData: number[] = [] as never[];
  let endData: number[] = [] as never[];
  for (let i = 0; i < startContoursMut.length; i += 1) {
    appendCubicContourPair(commands, startData, endData, startContoursMut[i], endContours[i]);
  }
  return { commands: commands, contour: undefined, endData: endData, issue: 'ok', startData: startData };
}

function reverseClosedCubicContour(contour: CubicContour): void {
  let reversed: CubicSegment[] = [] as never[];
  let i = contour.segments.length;
  while (i > 0) {
    i -= 1;
    const segment = contour.segments[i];
    reversed.push({
      controlX1: segment.controlX2,
      controlY1: segment.controlY2,
      controlX2: segment.controlX1,
      controlY2: segment.controlY1,
      x0: segment.x1,
      y0: segment.y1,
      x1: segment.x0,
      y1: segment.y0,
    });
  }
  contour.segments = reversed;
  if (contour.segments.length !== 0) {
    contour.x = contour.segments[0].x0;
    contour.y = contour.segments[0].y0;
  }
  contour.currentX = contour.x;
  contour.currentY = contour.y;
}

function splitCubicSegment(segment: Readonly<CubicSegment>, t: number): readonly [CubicSegment, CubicSegment] {
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
    { controlX1: x01, controlY1: y01, controlX2: x012, controlY2: y012, x0: segment.x0, y0: segment.y0, x1: x, y1: y },
    { controlX1: x123, controlY1: y123, controlX2: x23, controlY2: y23, x0: x, y0: y, x1: segment.x1, y1: segment.y1 },
  ];
}

function subdivideCubicSegments(
  source: Readonly<CubicSegment[]>,
  targetCount: number,
  pointX: number,
  pointY: number,
): CubicSegment[] {
  if (source.length === targetCount) {
    let copies: CubicSegment[] = [] as never[];
    for (const s of source) {
      copies.push({
        controlX1: s.controlX1,
        controlY1: s.controlY1,
        controlX2: s.controlX2,
        controlY2: s.controlY2,
        x0: s.x0,
        y0: s.y0,
        x1: s.x1,
        y1: s.y1,
      });
    }
    return copies;
  }
  if (source.length === 0) {
    let segments: CubicSegment[] = [] as never[];
    for (let _ = 0; _ < targetCount; _ += 1) {
      segments.push({
        controlX1: pointX,
        controlY1: pointY,
        controlX2: pointX,
        controlY2: pointY,
        x0: pointX,
        y0: pointY,
        x1: pointX,
        y1: pointY,
      });
    }
    return segments;
  }
  let partCounts: number[] = new Array(source.length).fill(1);
  const lengths: number[] = source.map((s) => cubicControlPolygonLength(s));
  let total = source.length;
  while (total < targetCount) {
    let best: number = 0;
    let bestLength: number = -1.0;
    for (let i = 0; i < source.length; i += 1) {
      const partLength = lengths[i] / partCounts[i];
      if (partLength > bestLength) {
        best = i;
        bestLength = partLength;
      }
    }
    partCounts[best] += 1;
    total += 1;
  }
  let segments: CubicSegment[] = [] as never[];
  for (let i = 0; i < source.length; i += 1) {
    let remainder = {
      controlX1: source[i].controlX1,
      controlY1: source[i].controlY1,
      controlX2: source[i].controlX2,
      controlY2: source[i].controlY2,
      x0: source[i].x0,
      y0: source[i].y0,
      x1: source[i].x1,
      y1: source[i].y1,
    };
    let parts = partCounts[i];
    while (parts > 1) {
      const [first, second] = splitCubicSegment(remainder, 1.0 / parts);
      segments.push(first);
      remainder = second;
      parts -= 1;
    }
    segments.push(remainder);
  }
  return segments;
}

export { allocatePathMorph, preparePathMorph };
