// Generated from crates/flight-path/src/reverse_path.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { forEachPathSegment } from './forEachPathSegment.ts';
import type { PathSegment } from './path.ts';
import { PathCommand } from './path.ts';
import type { Path } from './pathCompat.ts';

type SubpathPointKind =
  | { readonly kind: 'move' }
  | { readonly kind: 'line' }
  | { readonly kind: 'quad'; readonly cx: number; readonly cy: number }
  | { readonly kind: 'cubic'; readonly c1x: number; readonly c1y: number; readonly c2x: number; readonly c2y: number };

interface SubpathPoint {
  x: number;
  y: number;
  kind: SubpathPointKind;
}

interface Subpath {
  closed: boolean;
  points: SubpathPoint[];
}

function decodeSubpaths(path: Readonly<Path>): Subpath[] {
  let segments: PathSegment[] = [];
  forEachPathSegment(path, (segment) => segments.push(segment));
  let subpaths: Subpath[] = [];
  let current: number | undefined = undefined;
  for (const segment of segments) {
    {
      if (segment.kind === 'moveTo') {
        const x = segment.x;
        const y = segment.y;
        subpaths.push({ closed: false, points: [{ x, y, kind: { kind: 'move' as const } }] });
        current = subpaths.length - 1;
      } else if (segment.kind === 'lineTo') {
        const x = segment.x;
        const y = segment.y;
        if (current === undefined) {
          subpaths.push({ closed: false, points: [{ x: 0, y: 0, kind: { kind: 'move' as const } }] });
          current = subpaths.length - 1;
        }
        subpaths[current!].points.push({ x, y, kind: { kind: 'line' as const } });
      } else if (segment.kind === 'quadraticCurveTo') {
        const controlX = segment.controlX;
        const controlY = segment.controlY;
        const x = segment.x;
        const y = segment.y;
        if (current === undefined) {
          subpaths.push({ closed: false, points: [{ x: 0, y: 0, kind: { kind: 'move' as const } }] });
          current = subpaths.length - 1;
        }
        subpaths[current!].points.push({ x, y, kind: { kind: 'quad' as const, cx: controlX, cy: controlY } });
      } else if (segment.kind === 'cubicCurveTo') {
        const controlX1 = segment.controlX1;
        const controlX2 = segment.controlX2;
        const controlY1 = segment.controlY1;
        const controlY2 = segment.controlY2;
        const x = segment.x;
        const y = segment.y;
        if (current === undefined) {
          subpaths.push({ closed: false, points: [{ x: 0, y: 0, kind: { kind: 'move' as const } }] });
          current = subpaths.length - 1;
        }
        subpaths[current!].points.push({
          x,
          y,
          kind: { kind: 'cubic' as const, c1x: controlX1, c1y: controlY1, c2x: controlX2, c2y: controlY2 },
        });
      } else {
        if (current !== undefined) {
          const idx = current;
          subpaths[idx].closed = true;
        }
      }
    }
  }
  return subpaths;
}

function encodeReversedSubpath(subpath: Readonly<Subpath>, out: Path): void {
  const pts = subpath.points;
  if (pts.length === 0) {
    return;
  }
  const last = pts[pts.length - 1];
  out.commands.push(PathCommand.MOVE_TO & 0xff);
  out.data.push(last.x);
  out.data.push(last.y);
  let i = pts.length - 1;
  while (i >= 1) {
    const from = pts[i >>> 0];
    const to = pts[(i - 1) >>> 0];
    {
      const matchValue = from.kind;
      if (matchValue.kind === 'line' || matchValue.kind === 'move') {
        out.commands.push(PathCommand.LINE_TO & 0xff);
        out.data.push(to.x);
        out.data.push(to.y);
      } else if (matchValue.kind === 'quad') {
        const cx = matchValue.cx;
        const cy = matchValue.cy;
        out.commands.push(PathCommand.QUADRATIC_CURVE_TO & 0xff);
        out.data.push(cx);
        out.data.push(cy);
        out.data.push(to.x);
        out.data.push(to.y);
      } else {
        const c1x = matchValue.c1x;
        const c1y = matchValue.c1y;
        const c2x = matchValue.c2x;
        const c2y = matchValue.c2y;
        out.commands.push(PathCommand.CUBIC_CURVE_TO & 0xff);
        out.data.push(c2x);
        out.data.push(c2y);
        out.data.push(c1x);
        out.data.push(c1y);
        out.data.push(to.x);
        out.data.push(to.y);
      }
    }
    i--;
  }
  if (subpath.closed) {
    out.commands.push(PathCommand.CLOSE & 0xff);
  }
}

/**
 * Reverses the winding direction of all contours in `source` and writes the result into `out`.
 * Alias-safe: `out` may be the same object as `source`.
 */
export function reversePath(source: Readonly<Path>, out: Path): void {
  const subpaths = decodeSubpaths(source);
  const outCommands: number[] = out.commands;
  outCommands.length = 0;
  const outData: number[] = out.data;
  outData.length = 0;
  out.winding = source.winding;
  for (const subpath of subpaths) {
    encodeReversedSubpath(subpath, out);
  }
}
