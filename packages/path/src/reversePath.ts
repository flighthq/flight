import type { Path } from '@flighthq/types';
import { PathCommand } from '@flighthq/types';

// Reverses the winding direction of all contours in `source` and writes the result into `out`.
// Each subpath (from MOVE_TO to MOVE_TO / end) is independently reversed: its anchor sequence is
// flipped and control points are re-paired to match the reversed direction. The winding rule is
// preserved unchanged. Alias-safe: `out` may be the same object as `source`.
//
// Reversing a CCW contour produces CW, which is the standard technique for carving holes in a
// nonZero fill: append a CW copy of the inner boundary as a counter-wound subpath.
export function reversePath(source: Readonly<Path>, out: Path): void {
  // Decode source into logical subpaths so reversal can be done cleanly,
  // then re-encode them in reverse anchor order.
  const subpaths = decodeSubpaths(source);
  // Reset out, then re-encode reversed subpaths.
  out.commands.length = 0;
  out.data.length = 0;
  out.winding = source.winding;
  for (const subpath of subpaths) {
    encodeReversedSubpath(subpath, out);
  }
}

function decodeSubpaths(path: Readonly<Path>): Subpath[] {
  const commands = path.commands;
  const data = path.data;
  const subpaths: Subpath[] = [];
  let current: Subpath | null = null;
  let x = 0;
  let y = 0;
  let di = 0;
  const ensureCurrent = (): Subpath => {
    if (current === null) {
      current = { points: [{ x: 0, y: 0, kind: 'move' }], closed: false };
      subpaths.push(current);
    }
    return current;
  };
  for (let ci = 0; ci < commands.length; ci++) {
    const command = commands[ci];
    if (command === PathCommand.MOVE_TO) {
      x = data[di];
      y = data[di + 1];
      di += 2;
      current = { points: [{ x, y, kind: 'move' }], closed: false };
      subpaths.push(current);
    } else if (command === PathCommand.WIDE_MOVE_TO) {
      x = data[di + 2];
      y = data[di + 3];
      di += 4;
      current = { points: [{ x, y, kind: 'move' }], closed: false };
      subpaths.push(current);
    } else if (command === PathCommand.LINE_TO) {
      const sp = ensureCurrent();
      const nx = data[di];
      const ny = data[di + 1];
      di += 2;
      sp.points.push({ x: nx, y: ny, kind: 'line' });
      x = nx;
      y = ny;
    } else if (command === PathCommand.WIDE_LINE_TO) {
      const sp = ensureCurrent();
      const nx = data[di + 2];
      const ny = data[di + 3];
      di += 4;
      sp.points.push({ x: nx, y: ny, kind: 'line' });
      x = nx;
      y = ny;
    } else if (command === PathCommand.CURVE_TO) {
      const sp = ensureCurrent();
      const cx = data[di];
      const cy = data[di + 1];
      const nx = data[di + 2];
      const ny = data[di + 3];
      di += 4;
      sp.points.push({ x: nx, y: ny, kind: 'quad', cx, cy });
      x = nx;
      y = ny;
    } else if (command === PathCommand.CUBIC_CURVE_TO) {
      const sp = ensureCurrent();
      const c1x = data[di];
      const c1y = data[di + 1];
      const c2x = data[di + 2];
      const c2y = data[di + 3];
      const nx = data[di + 4];
      const ny = data[di + 5];
      di += 6;
      sp.points.push({ x: nx, y: ny, kind: 'cubic', c1x, c1y, c2x, c2y });
      x = nx;
      y = ny;
    } else if (command === PathCommand.CLOSE) {
      if (current !== null) {
        current.closed = true;
      }
    }
    // NO_OP and unrecognized verbs consume no data.
  }
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
