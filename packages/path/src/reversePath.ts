// Generated from crates/flight-path/src/reverse_path.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { forEachPathSegment } from './forEachPathSegment.ts';
import type { PathRaw, PathSegment } from './path.ts';
import { PathCommand } from './path.ts';

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

function decodeSubpaths(path: Readonly<PathRaw>): Subpath[] {
  let segments: PathSegment[] = [] as never[];
  forEachPathSegment(path, (segment) => segments.push(segment));
  let subpaths: Subpath[] = [] as never[];
  let current: number | undefined = undefined;
  for (const segment of segments) {
    {
      const matchValue = segment;
      if (matchValue.kind === 'moveTo') {
        const x = matchValue.x;
        const y = matchValue.y;
        subpaths.push({ closed: false, points: [{ x: x, y: y, kind: { kind: 'move' as const } }] });
        current = subpaths.length - 1;
      } else if (matchValue.kind === 'lineTo') {
        const x = matchValue.x;
        const y = matchValue.y;
        if (current === undefined) {
          subpaths.push({ closed: false, points: [{ x: 0.0, y: 0.0, kind: { kind: 'move' as const } }] });
          current = subpaths.length - 1;
        }
        subpaths[current!].points.push({ x: x, y: y, kind: { kind: 'line' as const } });
      } else if (matchValue.kind === 'quadraticCurveTo') {
        const controlX = matchValue.controlX;
        const controlY = matchValue.controlY;
        const x = matchValue.x;
        const y = matchValue.y;
        if (current === undefined) {
          subpaths.push({ closed: false, points: [{ x: 0.0, y: 0.0, kind: { kind: 'move' as const } }] });
          current = subpaths.length - 1;
        }
        subpaths[current!].points.push({ x: x, y: y, kind: { kind: 'quad' as const, cx: controlX, cy: controlY } });
      } else if (matchValue.kind === 'cubicCurveTo') {
        const controlX1 = matchValue.controlX1;
        const controlX2 = matchValue.controlX2;
        const controlY1 = matchValue.controlY1;
        const controlY2 = matchValue.controlY2;
        const x = matchValue.x;
        const y = matchValue.y;
        if (current === undefined) {
          subpaths.push({ closed: false, points: [{ x: 0.0, y: 0.0, kind: { kind: 'move' as const } }] });
          current = subpaths.length - 1;
        }
        subpaths[current!].points.push({
          x: x,
          y: y,
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

function encodeReversedSubpath(subpath: Readonly<Subpath>, out: PathRaw): void {
  const pts = subpath.points;
  if (pts.length === 0) {
    return;
  }
  const last = pts[pts.length - 1];
  out.commands.push(PathCommand.MOVE_TO & 0xff);
  out.data.push(last.x);
  out.data.push(last.y);
  let i = (pts.length | 0) - 1;
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
    i -= 1;
  }
  if (subpath.closed) {
    out.commands.push(PathCommand.CLOSE & 0xff);
  }
}

/**
 * Reverses the winding direction of all contours in `source` and writes the result into `out`.
 * Alias-safe: `out` may be the same object as `source`.
 */
export function reversePath(source: Readonly<PathRaw>, out: PathRaw): void {
  const subpaths = decodeSubpaths(source);
  out.commands.length = 0;
  out.data.length = 0;
  out.winding = source.winding;
  for (const subpath of subpaths) {
    encodeReversedSubpath(subpath, out);
  }
}
