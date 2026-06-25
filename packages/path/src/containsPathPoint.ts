import type { Path } from '@flighthq/types';
import { PathCommand } from '@flighthq/types';

/**
 * Tests whether point (px, py) lies inside the path using the path's winding rule
 * ('evenOdd' or 'nonZero'). Curves are adaptively flattened before the winding
 * number test; the tolerance is in path units.
 *
 * The algorithm casts a ray rightward from (px, py) and counts crossings per
 * contour. For 'nonZero' it accumulates signed winding; for 'evenOdd' it tests
 * parity. Uses the standard convention: points on the boundary are not guaranteed
 * to return true.
 */
export function containsPathPoint(path: Readonly<Path>, px: number, py: number, tolerance = 0.25): boolean {
  const winding = computePathWindingNumber(path, px, py, tolerance);
  if (path.winding === 'evenOdd') return (winding & 1) !== 0;
  return winding !== 0;
}

// Squared perpendicular distance from (px,py) to chord (x0,y0)-(x1,y1).
function chordDistSq(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ax = px - x0;
    const ay = py - y0;
    return ax * ax + ay * ay;
  }
  const cross = dx * (y0 - py) - dy * (x0 - px);
  return (cross * cross) / lenSq;
}

// Computes the winding number of (px, py) relative to the path by flattening each
// contour to line segments and accumulating signed crossings.
function computePathWindingNumber(path: Readonly<Path>, px: number, py: number, tolerance: number): number {
  const commands = path.commands;
  const data = path.data;
  const toleranceSq = tolerance * tolerance;
  let windingNumber = 0;
  let x = 0;
  let y = 0;
  let contourStartX = 0;
  let contourStartY = 0;
  let hasContour = false;
  let lastX = 0;
  let lastY = 0;
  let di = 0;
  const flushContour = () => {
    if (hasContour) {
      windingNumber += countSegmentCrossings(px, py, lastX, lastY, contourStartX, contourStartY);
    }
  };
  for (let ci = 0; ci < commands.length; ci++) {
    const command = commands[ci];
    if (command === PathCommand.MOVE_TO) {
      flushContour();
      x = data[di];
      y = data[di + 1];
      di += 2;
      contourStartX = x;
      contourStartY = y;
      lastX = x;
      lastY = y;
      hasContour = true;
    } else if (command === PathCommand.WIDE_MOVE_TO) {
      flushContour();
      x = data[di + 2];
      y = data[di + 3];
      di += 4;
      contourStartX = x;
      contourStartY = y;
      lastX = x;
      lastY = y;
      hasContour = true;
    } else if (command === PathCommand.LINE_TO) {
      const nx = data[di];
      const ny = data[di + 1];
      di += 2;
      if (hasContour) {
        windingNumber += countSegmentCrossings(px, py, lastX, lastY, nx, ny);
      }
      lastX = nx;
      lastY = ny;
      x = nx;
      y = ny;
    } else if (command === PathCommand.WIDE_LINE_TO) {
      const nx = data[di + 2];
      const ny = data[di + 3];
      di += 4;
      if (hasContour) {
        windingNumber += countSegmentCrossings(px, py, lastX, lastY, nx, ny);
      }
      lastX = nx;
      lastY = ny;
      x = nx;
      y = ny;
    } else if (command === PathCommand.CURVE_TO) {
      const cx = data[di];
      const cy = data[di + 1];
      const ax = data[di + 2];
      const ay = data[di + 3];
      di += 4;
      if (hasContour) {
        windingNumber += flattenQuadraticWindingNumber(px, py, lastX, lastY, cx, cy, ax, ay, toleranceSq, 0);
      }
      lastX = ax;
      lastY = ay;
      x = ax;
      y = ay;
    } else if (command === PathCommand.CUBIC_CURVE_TO) {
      const c1x = data[di];
      const c1y = data[di + 1];
      const c2x = data[di + 2];
      const c2y = data[di + 3];
      const ax = data[di + 4];
      const ay = data[di + 5];
      di += 6;
      if (hasContour) {
        windingNumber += flattenCubicWindingNumber(px, py, lastX, lastY, c1x, c1y, c2x, c2y, ax, ay, toleranceSq, 0);
      }
      lastX = ax;
      lastY = ay;
      x = ax;
      y = ay;
    } else if (command === PathCommand.CLOSE) {
      // Explicit close: emit a segment back to the contour start and reset.
      if (hasContour) {
        windingNumber += countSegmentCrossings(px, py, lastX, lastY, contourStartX, contourStartY);
        lastX = contourStartX;
        lastY = contourStartY;
        x = contourStartX;
        y = contourStartY;
        hasContour = false;
      }
    }
    // NO_OP and unrecognized verbs consume no data.
  }
  // Close the final open contour.
  flushContour();
  return Math.abs(windingNumber);
}

// Returns the signed crossing count contribution of segment (x0,y0)→(x1,y1) for
// the rightward ray from (px, py). +1 for upward crossings, -1 for downward.
function countSegmentCrossings(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  // Only segments that cross the horizontal ray (py) contribute.
  if ((y0 <= py && y1 > py) || (y1 <= py && y0 > py)) {
    // x coordinate of the crossing — only count if the segment crosses to the right.
    const crossX = x0 + ((py - y0) * (x1 - x0)) / (y1 - y0);
    if (px < crossX) {
      return y1 > y0 ? 1 : -1;
    }
  }
  return 0;
}

function flattenCubicWindingNumber(
  px: number,
  py: number,
  x0: number,
  y0: number,
  c1x: number,
  c1y: number,
  c2x: number,
  c2y: number,
  x1: number,
  y1: number,
  toleranceSq: number,
  depth: number,
): number {
  const d1 = chordDistSq(c1x, c1y, x0, y0, x1, y1);
  const d2 = chordDistSq(c2x, c2y, x0, y0, x1, y1);
  if (depth >= MAX_SUBDIVISION_DEPTH || (d1 <= toleranceSq && d2 <= toleranceSq)) {
    return countSegmentCrossings(px, py, x0, y0, x1, y1);
  }
  const x01 = (x0 + c1x) / 2;
  const y01 = (y0 + c1y) / 2;
  const x12 = (c1x + c2x) / 2;
  const y12 = (c1y + c2y) / 2;
  const x23 = (c2x + x1) / 2;
  const y23 = (c2y + y1) / 2;
  const x012 = (x01 + x12) / 2;
  const y012 = (y01 + y12) / 2;
  const x123 = (x12 + x23) / 2;
  const y123 = (y12 + y23) / 2;
  const xm = (x012 + x123) / 2;
  const ym = (y012 + y123) / 2;
  return (
    flattenCubicWindingNumber(px, py, x0, y0, x01, y01, x012, y012, xm, ym, toleranceSq, depth + 1) +
    flattenCubicWindingNumber(px, py, xm, ym, x123, y123, x23, y23, x1, y1, toleranceSq, depth + 1)
  );
}

function flattenQuadraticWindingNumber(
  px: number,
  py: number,
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  toleranceSq: number,
  depth: number,
): number {
  if (depth >= MAX_SUBDIVISION_DEPTH || chordDistSq(cx, cy, x0, y0, x1, y1) <= toleranceSq) {
    return countSegmentCrossings(px, py, x0, y0, x1, y1);
  }
  const mx01 = (x0 + cx) / 2;
  const my01 = (y0 + cy) / 2;
  const mx12 = (cx + x1) / 2;
  const my12 = (cy + y1) / 2;
  const mx = (mx01 + mx12) / 2;
  const my = (my01 + my12) / 2;
  return (
    flattenQuadraticWindingNumber(px, py, x0, y0, mx01, my01, mx, my, toleranceSq, depth + 1) +
    flattenQuadraticWindingNumber(px, py, mx, my, mx12, my12, x1, y1, toleranceSq, depth + 1)
  );
}

const MAX_SUBDIVISION_DEPTH = 16;
