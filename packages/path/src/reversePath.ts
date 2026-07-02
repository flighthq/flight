import type { Path } from '@flighthq/types';
import { PathCommand } from '@flighthq/types';

import { forEachPathSegment } from './forEachPathSegment';

// Reverses the winding direction of all contours in `source` and writes the result into `out`.
// Each subpath (from MOVE_TO to MOVE_TO / end) is independently reversed: its anchor sequence is
// flipped and control points are re-paired to match the reversed direction. The winding rule is
// preserved unchanged. Alias-safe: `out` may be the same object as `source`.
//
// Reversing a CCW contour produces CW, which is the standard technique for carving holes in a
// nonZero fill: append a CW copy of the inner boundary as a counter-wound subpath.
export function reversePath(source: Readonly<Path>, out: Path): void {
  const subpaths = decodeSubpaths(source);
  out.commands.length = 0;
  out.data.length = 0;
  out.winding = source.winding;
  for (const subpath of subpaths) {
    encodeReversedSubpath(subpath, out);
  }
}

function decodeSubpaths(path: Readonly<Path>): Subpath[] {
  const subpaths: Subpath[] = [];
  let current: Subpath | null = null;
  const ensureCurrent = (): Subpath => {
    if (current === null) {
      current = { points: [{ x: 0, y: 0, kind: 'move' }], closed: false };
      subpaths.push(current);
    }
    return current;
  };
  forEachPathSegment(path, (segment) => {
    if (segment.kind === 'moveTo') {
      current = { points: [{ x: segment.x, y: segment.y, kind: 'move' }], closed: false };
      subpaths.push(current);
    } else if (segment.kind === 'lineTo') {
      ensureCurrent().points.push({ x: segment.x, y: segment.y, kind: 'line' });
    } else if (segment.kind === 'curveTo') {
      ensureCurrent().points.push({
        x: segment.x,
        y: segment.y,
        kind: 'quad',
        cx: segment.controlX,
        cy: segment.controlY,
      });
    } else if (segment.kind === 'cubicCurveTo') {
      ensureCurrent().points.push({
        x: segment.x,
        y: segment.y,
        kind: 'cubic',
        c1x: segment.control1X,
        c1y: segment.control1Y,
        c2x: segment.control2X,
        c2y: segment.control2Y,
      });
    } else if (segment.kind === 'close') {
      if (current !== null) current.closed = true;
    }
  });
  return subpaths;
}

function encodeReversedSubpath(subpath: Readonly<Subpath>, out: Path): void {
  const pts = subpath.points;
  if (pts.length === 0) return;
  // The last point becomes the new start.
  const last = pts[pts.length - 1];
  out.commands.push(PathCommand.MOVE_TO);
  out.data.push(last.x, last.y);
  // Walk backwards from (n-1) down to 0, emitting the segment type of the point we're leaving.
  for (let i = pts.length - 1; i >= 1; i--) {
    const from = pts[i];
    const to = pts[i - 1];
    if (from.kind === 'line' || from.kind === 'move') {
      out.commands.push(PathCommand.LINE_TO);
      out.data.push(to.x, to.y);
    } else if (from.kind === 'quad') {
      // Reversed quadratic: control stays the same, anchor is now `to`.
      out.commands.push(PathCommand.CURVE_TO);
      out.data.push(from.cx, from.cy, to.x, to.y);
    } else if (from.kind === 'cubic') {
      // Reversed cubic: swap control points c1↔c2.
      out.commands.push(PathCommand.CUBIC_CURVE_TO);
      out.data.push(from.c2x, from.c2y, from.c1x, from.c1y, to.x, to.y);
    }
  }
  if (subpath.closed) {
    out.commands.push(PathCommand.CLOSE);
  }
}

interface Subpath {
  closed: boolean;
  points: SubpathPoint[];
}

type SubpathPoint =
  | { kind: 'move'; x: number; y: number }
  | { kind: 'line'; x: number; y: number }
  | { kind: 'quad'; x: number; y: number; cx: number; cy: number }
  | { kind: 'cubic'; x: number; y: number; c1x: number; c1y: number; c2x: number; c2y: number };
