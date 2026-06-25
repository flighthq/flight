import type { Path } from '@flighthq/types';
import { PathCommand } from '@flighthq/types';

// Flattens a Path's curves into straight-line contours. Each contour is a flat
// [x0, y0, x1, y1, ...] polyline in the path's own coordinate space; quadratic and cubic segments are
// adaptively subdivided until their deviation from a chord is within `tolerance` (path units).
// Consumers (clip stencil fill, future hardware shape fills) take these contours; the path's winding
// rule travels on the path itself, not here. Verb/stride semantics mirror the canvas command reader.
// A CLOSE verb appends the contour's start point, making the closure explicit in the output.
export function flattenPath(path: Readonly<Path>, tolerance = 0.25): number[][] {
  const commands = path.commands;
  const data = path.data;
  const toleranceSq = tolerance * tolerance;
  const contours: number[][] = [];
  let contour: number[] | null = null;
  let x = 0;
  let y = 0;
  // Start point of the current contour — used by CLOSE to append the closing segment.
  let contourStartX = 0;
  let contourStartY = 0;
  let di = 0;

  for (let ci = 0; ci < commands.length; ci++) {
    const command = commands[ci];
    if (command === PathCommand.MOVE_TO) {
      x = data[di];
      y = data[di + 1];
      di += 2;
      contourStartX = x;
      contourStartY = y;
      contour = [x, y];
      contours.push(contour);
    } else if (command === PathCommand.WIDE_MOVE_TO) {
      x = data[di + 2];
      y = data[di + 3];
      di += 4;
      contourStartX = x;
      contourStartY = y;
      contour = [x, y];
      contours.push(contour);
    } else if (command === PathCommand.LINE_TO) {
      contour = ensureContour(contours, contour);
      x = data[di];
      y = data[di + 1];
      di += 2;
      contour.push(x, y);
    } else if (command === PathCommand.WIDE_LINE_TO) {
      contour = ensureContour(contours, contour);
      x = data[di + 2];
      y = data[di + 3];
      di += 4;
      contour.push(x, y);
    } else if (command === PathCommand.CURVE_TO) {
      contour = ensureContour(contours, contour);
      flattenQuadratic(contour, x, y, data[di], data[di + 1], data[di + 2], data[di + 3], toleranceSq, 0);
      x = data[di + 2];
      y = data[di + 3];
      di += 4;
    } else if (command === PathCommand.CUBIC_CURVE_TO) {
      contour = ensureContour(contours, contour);
      flattenCubic(
        contour,
        x,
        y,
        data[di],
        data[di + 1],
        data[di + 2],
        data[di + 3],
        data[di + 4],
        data[di + 5],
        toleranceSq,
        0,
      );
      x = data[di + 4];
      y = data[di + 5];
      di += 6;
    } else if (command === PathCommand.CLOSE) {
      // Explicit authored closure: append the start point if the current position is not already there.
      if (contour !== null && (x !== contourStartX || y !== contourStartY)) {
        contour.push(contourStartX, contourStartY);
      }
      x = contourStartX;
      y = contourStartY;
      // Reset contour so the next draw verb starts a fresh implicit contour if needed.
      contour = null;
    }
    // NO_OP and unrecognized verbs consume no data and are skipped.
  }

  return contours;
}

const MAX_SUBDIVISION_DEPTH = 16;

// Starts an implicit contour at the origin when a draw verb precedes any move, mirroring the canvas
// reader's moveTo(0, 0) fallback. Returns the contour to draw into.
function ensureContour(contours: number[][], contour: number[] | null): number[] {
  if (contour !== null) return contour;
  const started = [0, 0];
  contours.push(started);
  return started;
}

// Squared perpendicular distance from (px, py) to the segment (x0,y0)-(x1,y1) — used as the flatness
// test for curve subdivision so we avoid a sqrt per check.
function distanceToChordSq(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    const ax = px - x0;
    const ay = py - y0;
    return ax * ax + ay * ay;
  }
  const cross = dx * (y0 - py) - dy * (x0 - px);
  return (cross * cross) / lengthSq;
}

// Appends the flattened points of a cubic Bezier (excluding the start, including the end) via
// recursive de Casteljau subdivision at the midpoint.
function flattenCubic(
  out: number[],
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
): void {
  const d1 = distanceToChordSq(c1x, c1y, x0, y0, x1, y1);
  const d2 = distanceToChordSq(c2x, c2y, x0, y0, x1, y1);
  if (depth >= MAX_SUBDIVISION_DEPTH || (d1 <= toleranceSq && d2 <= toleranceSq)) {
    out.push(x1, y1);
    return;
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
  flattenCubic(out, x0, y0, x01, y01, x012, y012, xm, ym, toleranceSq, depth + 1);
  flattenCubic(out, xm, ym, x123, y123, x23, y23, x1, y1, toleranceSq, depth + 1);
}

// Appends the flattened points of a quadratic Bezier (excluding the start, including the end).
function flattenQuadratic(
  out: number[],
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  toleranceSq: number,
  depth: number,
): void {
  if (depth >= MAX_SUBDIVISION_DEPTH || distanceToChordSq(cx, cy, x0, y0, x1, y1) <= toleranceSq) {
    out.push(x1, y1);
    return;
  }
  const x01 = (x0 + cx) / 2;
  const y01 = (y0 + cy) / 2;
  const x12 = (cx + x1) / 2;
  const y12 = (cy + y1) / 2;
  const xm = (x01 + x12) / 2;
  const ym = (y01 + y12) / 2;
  flattenQuadratic(out, x0, y0, x01, y01, xm, ym, toleranceSq, depth + 1);
  flattenQuadratic(out, xm, ym, x12, y12, x1, y1, toleranceSq, depth + 1);
}
