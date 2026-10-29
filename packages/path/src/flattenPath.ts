// Generated from crates/flight-path/src/flatten_path.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { PathRaw } from './path.ts';
import { PathCommand } from './path.ts';

const MAX_SUBDIVISION_DEPTH: number = 16;

function distanceToChordSq(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0.0) {
    const ax = px - x0;
    const ay = py - y0;
    return ax * ax + ay * ay;
  }
  const cross = dx * (y0 - py) - dy * (x0 - px);
  return (cross * cross) / lengthSq;
}

function ensureContour(contours: number[][], contour?: number): number | undefined {
  if (contour !== undefined) {
    return contour;
  }
  contours.push([0.0, 0.0]);
  return contours.length - 1;
}

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
    out.push(x1);
    out.push(y1);
    return;
  }
  const x01 = (x0 + c1x) / 2.0;
  const y01 = (y0 + c1y) / 2.0;
  const x12 = (c1x + c2x) / 2.0;
  const y12 = (c1y + c2y) / 2.0;
  const x23 = (c2x + x1) / 2.0;
  const y23 = (c2y + y1) / 2.0;
  const x012 = (x01 + x12) / 2.0;
  const y012 = (y01 + y12) / 2.0;
  const x123 = (x12 + x23) / 2.0;
  const y123 = (y12 + y23) / 2.0;
  const xm = (x012 + x123) / 2.0;
  const ym = (y012 + y123) / 2.0;
  flattenCubic(out, x0, y0, x01, y01, x012, y012, xm, ym, toleranceSq, depth + 1);
  flattenCubic(out, xm, ym, x123, y123, x23, y23, x1, y1, toleranceSq, depth + 1);
}

/**
 * Flattens a Path's curves into straight-line contours. Each contour is a flat
 * [x0, y0, x1, y1, ...] polyline. Quadratic and cubic segments are adaptively subdivided
 * until their deviation from a chord is within `tolerance` (path units).
 * A CLOSE verb appends the contour's start point, making the closure explicit.
 */
export function flattenPath(path: Readonly<PathRaw>, tolerance?: number): number[][] {
  let out: number[][] = [] as never[];
  flattenPathInto(out, path, tolerance);
  return out;
}

function flattenPathInto(out: number[][], path: Readonly<PathRaw>, tolerance?: number): void {
  tolerance = tolerance ?? 0.25;
  const commands = path.commands;
  const data = path.data;
  const toleranceSq = tolerance * tolerance;
  let contour: number | undefined = undefined;
  let x: number = 0.0;
  let y: number = 0.0;
  let contourStartX: number = 0.0;
  let contourStartY: number = 0.0;
  let di: number = 0;
  for (let ci = 0; ci < commands.length; ci += 1) {
    const command = commands[ci];
    if (command === PathCommand.MOVE_TO) {
      x = data[di];
      y = data[di + 1];
      di += 2;
      contourStartX = x;
      contourStartY = y;
      out.push([x, y]);
      contour = out.length - 1;
    } else {
      if (command === PathCommand.WIDE_MOVE_TO) {
        x = data[di + 2];
        y = data[di + 3];
        di += 4;
        contourStartX = x;
        contourStartY = y;
        out.push([x, y]);
        contour = out.length - 1;
      } else {
        if (command === PathCommand.LINE_TO) {
          contour = ensureContour(out, contour);
          x = data[di];
          y = data[di + 1];
          di += 2;
          out[contour!].push(x);
          out[contour!].push(y);
        } else {
          if (command === PathCommand.WIDE_LINE_TO) {
            contour = ensureContour(out, contour);
            x = data[di + 2];
            y = data[di + 3];
            di += 4;
            out[contour!].push(x);
            out[contour!].push(y);
          } else {
            if (command === PathCommand.QUADRATIC_CURVE_TO) {
              contour = ensureContour(out, contour);
              const ciIdx = contour!;
              flattenQuadratic(out[ciIdx], x, y, data[di], data[di + 1], data[di + 2], data[di + 3], toleranceSq, 0);
              x = data[di + 2];
              y = data[di + 3];
              di += 4;
            } else {
              if (command === PathCommand.CUBIC_CURVE_TO) {
                contour = ensureContour(out, contour);
                const ciIdx = contour!;
                flattenCubic(
                  out[ciIdx],
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
              } else {
                if (command === PathCommand.CLOSE) {
                  if (contour !== undefined) {
                    const ciIdx = contour;
                    if (x !== contourStartX || y !== contourStartY) {
                      out[ciIdx].push(contourStartX);
                      out[ciIdx].push(contourStartY);
                    }
                  }
                  x = contourStartX;
                  y = contourStartY;
                  contour = undefined;
                }
              }
            }
          }
        }
      }
    }
  }
}

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
    out.push(x1);
    out.push(y1);
    return;
  }
  const x01 = (x0 + cx) / 2.0;
  const y01 = (y0 + cy) / 2.0;
  const x12 = (cx + x1) / 2.0;
  const y12 = (cy + y1) / 2.0;
  const xm = (x01 + x12) / 2.0;
  const ym = (y01 + y12) / 2.0;
  flattenQuadratic(out, x0, y0, x01, y01, xm, ym, toleranceSq, depth + 1);
  flattenQuadratic(out, xm, ym, x12, y12, x1, y1, toleranceSq, depth + 1);
}
